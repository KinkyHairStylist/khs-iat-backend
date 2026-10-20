import prisma from "../../../lib/prisma/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { AppError } from "../../../middlewares/centralAppError";
import type { ClientListQuery } from "../../../schemas/merchant/clients.schema";
import { requireMerchantBusiness } from "../merchantBusiness";
import { activeMemberSql, bookingsOfClients, clientSegment, membershipSessions, newClientCutoff, summarizeBookings } from "./clientLinks";
import { fromDb } from "./clientMapping";

// Reading the salon's clients: the list (searched, filtered, paged here),
// one client in full, and the short list the message picker uses.

const SORT: Record<ClientListQuery["sort"], Prisma.Sql> = {
  newest: Prisma.sql`c."createdAt" DESC`,
  oldest: Prisma.sql`c."createdAt" ASC`,
  nameAsc: Prisma.sql`LOWER(c."firstName") ASC, LOWER(c."lastName") ASC`,
  nameDesc: Prisma.sql`LOWER(c."firstName") DESC, LOWER(c."lastName") DESC`,
};

/** Average rating this client has given the owner's salons, by lower-cased email. */
async function ratingsGiven(ownerId: string, emails: string[]) {
  if (emails.length === 0) return new Map<string, { average: number; count: number }>();
  const rows = await prisma.$queryRaw<Array<{ email: string; average: number; count: number }>>`
    SELECT LOWER(u.email) AS email, AVG(r.rating)::float AS average, COUNT(*)::int AS count
    FROM reviews r JOIN "user" u ON u.id::text = r."clientId"
    WHERE r."businessId" IN (SELECT b.id FROM businesses b WHERE b.owner_id = ${ownerId}::uuid) AND LOWER(u.email) = ANY(${emails}::text[])
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.email, { average: Math.round(r.average * 10) / 10, count: r.count }]));
}

export async function listClients(userId: string, q: ClientListQuery) {
  const business = await requireMerchantBusiness(userId);
  const ownerId = business.ownerId;
  const like = `%${q.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const where = Prisma.sql`c.owner_id = ${ownerId}::uuid AND c."isActive" = true
    ${q.search ? Prisma.sql`AND (c."firstName" ILIKE ${like} OR c."lastName" ILIKE ${like} OR c.email ILIKE ${like} OR c.phone ILIKE ${like} OR CONCAT(c."firstName", ' ', c."lastName") ILIKE ${like})` : Prisma.empty}
    ${q.segment === "new" ? Prisma.sql`AND c."createdAt" >= ${newClientCutoff()}` : q.segment === "regular" ? Prisma.sql`AND c."createdAt" < ${newClientCutoff()}` : Prisma.empty}
    ${q.segment === "members" ? Prisma.sql`AND ${activeMemberSql(ownerId)}` : Prisma.empty}`;

  const [rows, [{ total }]] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; firstName: string; lastName: string; email: string; phone: string; phoneCode: string | null; profileImage: string | null; createdAt: Date }>>`
      SELECT c.id::text AS id, c."firstName", c."lastName", c.email, c.phone, c."phoneCode", c."profileImage", c."createdAt"
      FROM clients c WHERE ${where} ORDER BY ${SORT[q.sort]} LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
    prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM clients c WHERE ${where}`,
  ]);

  const ids = rows.map((r) => r.id);
  const emails = rows.map((r) => r.email.toLowerCase());
  const [bookings, addresses, members, ratings] = await Promise.all([
    bookingsOfClients(ownerId, ids),
    prisma.client_addresses.findMany({ where: { client_id: { in: ids } }, select: { client_id: true, location: true, addressName: true, isPrimary: true }, orderBy: { isPrimary: "desc" } }),
    membershipSessions(ownerId, emails),
    ratingsGiven(ownerId, emails),
  ]);
  const firstAddress = new Map<string, string>();
  for (const a of addresses) if (!firstAddress.has(a.client_id) && (a.location || a.addressName)) firstAddress.set(a.client_id, (a.location || a.addressName)!);

  return {
    clients: rows.map((c) => {
      const email = c.email.toLowerCase();
      return {
        id: c.id, firstName: c.firstName, lastName: c.lastName, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email,
        phone: c.phoneCode ? `${c.phoneCode} ${c.phone}` : c.phone, profileImage: c.profileImage, createdAt: c.createdAt,
        location: firstAddress.get(c.id) ?? null, segment: clientSegment(c.createdAt),
        isMember: members.has(email), membershipSessionsLeft: members.get(email) ?? 0,
        averageRating: ratings.get(email)?.average ?? 0,
        ...summarizeBookings(bookings.filter((b) => b.clientId === c.id), q.date),
      };
    }),
    totalItems: total,
    totalPages: Math.ceil(total / q.limit),
    page: q.page,
    startIndex: total === 0 ? 0 : (q.page - 1) * q.limit + 1,
    endIndex: Math.min(q.page * q.limit, total),
  };
}

/** The owner's active client record, or 404. */
export async function ownClient(ownerId: string, clientId: string) {
  const client = await prisma.clients.findFirst({ where: { id: clientId, owner_id: ownerId, isActive: true } });
  if (!client) throw AppError.notFound("Client");
  return client;
}

export async function getClient(userId: string, clientId: string) {
  const business = await requireMerchantBusiness(userId);
  const client = await ownClient(business.ownerId, clientId);
  const [addresses, contacts, settings, ratings, members] = await Promise.all([
    prisma.client_addresses.findMany({ where: { client_id: clientId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }),
    prisma.emergency_contacts_schema.findMany({ where: { client_id: clientId }, orderBy: { createdAt: "asc" } }),
    prisma.client_settings.findFirst({ where: { client_id: clientId } }),
    ratingsGiven(business.ownerId, [client.email.toLowerCase()]),
    membershipSessions(business.ownerId, [client.email.toLowerCase()]),
  ]);
  const rating = ratings.get(client.email.toLowerCase());
  return {
    ...fromDb(client, addresses, contacts, settings),
    segment: clientSegment(client.createdAt),
    averageRating: rating?.average ?? 0,
    reviewCount: rating?.count ?? 0,
    isMember: members.has(client.email.toLowerCase()),
    membershipSessionsLeft: members.get(client.email.toLowerCase()) ?? 0,
  };
}

/** Who can be messaged: every active client, name and photo only. */
export async function clientsForMessaging(userId: string) {
  const business = await requireMerchantBusiness(userId);
  const rows = await prisma.clients.findMany({
    where: { owner_id: business.ownerId, isActive: true },
    select: { id: true, firstName: true, lastName: true, email: true, profileImage: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 2000,
  });
  return rows.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), email: c.email, profileImage: c.profileImage }));
}
