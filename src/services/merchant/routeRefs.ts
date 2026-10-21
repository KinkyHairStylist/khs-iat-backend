import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import { slugify } from "../customer/salonLinkService";
import { requireMerchantBusiness } from "./merchantBusiness";

// The merchant dashboard's page addresses use readable references instead of raw
// ids: a booking by its order number (BKID-1234567), a client by name plus the
// first 8 characters of their id (jane-doe-3f9a1c2e). The routes accept either
// form (old links with ids keep working); every lookup stays inside the
// merchant's own salon.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER = /^bkid-\d{5,12}$/i;
const NAME_AND_ID = /^(.*)-([0-9a-f]{8})$/i;

const rawId = (params: unknown) => String((params as { id?: unknown })?.id ?? "").trim().slice(0, 200);

/** A booking's appointment id from :id (an appointment id or the order number). */
export async function bookingRef(userId: string, params: unknown): Promise<string> {
  const raw = rawId(params);
  if (UUID.test(raw)) return raw.toLowerCase();
  if (!ORDER.test(raw)) throw AppError.notFound("Booking");
  const business = await requireMerchantBusiness(userId);
  const first = await prisma.appointments.findFirst({
    where: { orderId: raw.toUpperCase(), business_id: business.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!first) throw AppError.notFound("Booking");
  return first.id;
}

/** A client's id from :id (an id or name-plus-short-id). */
export async function clientRef(userId: string, params: unknown): Promise<string> {
  const raw = rawId(params);
  if (UUID.test(raw)) return raw.toLowerCase();
  const m = NAME_AND_ID.exec(raw.toLowerCase());
  if (!m) throw AppError.notFound("Client");
  const business = await requireMerchantBusiness(userId);
  const matches = await prisma.$queryRaw<Array<{ id: string; firstName: string; lastName: string }>>`
    SELECT id::text, "firstName", "lastName" FROM clients
    WHERE owner_id = ${business.ownerId}::uuid AND id::text LIKE ${`${m[2]}%`}`;
  // The name part only has to match when the id prefix alone is ambiguous (so a renamed client's old link still works).
  const hit = matches.length === 1 ? matches[0] : matches.find((c) => slugify(`${c.firstName} ${c.lastName}`) === m[1]);
  if (!hit) throw AppError.notFound("Client");
  return hit.id;
}
