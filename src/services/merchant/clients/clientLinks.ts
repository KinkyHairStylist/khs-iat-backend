import prisma from "../../../lib/prisma/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { holdCutoff } from "../../bookings/bookingHolds";
import { parseClockToMinutes } from "../../bookings/bookingRules";

// What ties a salon's client record to the rest of KHS. A booking is the
// client's when the salon made it for that record, or when a KHS customer
// with the same email booked at one of the owner's salons. Memberships and
// reviews belong to the customer account with that email.

export const NEW_CLIENT_DAYS = 30;
export const newClientCutoff = (now = Date.now()) => new Date(now - NEW_CLIENT_DAYS * 86_400_000);
export const clientSegment = (createdAt: Date) => (createdAt >= newClientCutoff() ? "New" : "Regular");

/** Joins appointments `a` onto client records `c` for this owner. */
export const clientAppointmentJoin = (ownerId: string) => Prisma.sql`
  a.business_id IN (SELECT b.id FROM businesses b WHERE b.owner_id = ${ownerId}::uuid)
  AND (a.business_client_id = c.id OR a.client_id IN (SELECT u.id FROM "user" u WHERE LOWER(u.email) = LOWER(c.email)))`;

/** True when the record's customer account holds an active membership at one of the owner's salons. */
export const activeMemberSql = (ownerId: string) => Prisma.sql`EXISTS (
  SELECT 1 FROM merchant_membership_purchases mp
  JOIN "user" mu ON mu.id = mp."clientId"
  JOIN businesses mb ON mb.id = mp."businessId"
  WHERE LOWER(mu.email) = LOWER(c.email) AND mb.owner_id = ${ownerId}::uuid
    AND mp.status = 'ACTIVE' AND mp."remainingSessions" > 0 AND mp."expiresAt" > NOW())`;

export interface ClientBookingRow {
  clientId: string;
  id: string;
  date: string;
  time: string;
  status: string;
  amount: number;
}

/** Every booking of these client records (abandoned customer checkouts left out). */
export async function bookingsOfClients(ownerId: string, clientIds: string[]): Promise<ClientBookingRow[]> {
  if (clientIds.length === 0) return [];
  return prisma.$queryRaw<ClientBookingRow[]>`
    SELECT c.id::text AS "clientId", a.id::text AS id, a.date, a.time, a.status::text AS status, a.amount
    FROM clients c JOIN appointments a ON ${clientAppointmentJoin(ownerId)}
    WHERE c.id = ANY(${clientIds}::uuid[])
      AND NOT (a.status = 'Pending' AND a.client_id IS NOT NULL AND a."createdAt" < ${holdCutoff()})`;
}

export interface ClientStats {
  visits: number;
  lifetimeValue: number;
  noShows: number;
  nextAppointment: { date: string; time: string } | null;
}

/** Visits and lifetime value are completed bookings; the next appointment is the soonest still to come. */
export function summarizeBookings(rows: ClientBookingRow[], today: string): ClientStats {
  let visits = 0;
  let cents = 0;
  let noShows = 0;
  let next: ClientBookingRow | null = null;
  for (const r of rows) {
    if (r.status === "Completed") {
      visits += 1;
      cents += Math.round(Number(r.amount) * 100);
    } else if (r.status === "No Show") {
      noShows += 1;
    } else if ((r.status === "Confirmed" || r.status === "Rescheduled") && r.date >= today) {
      const sooner = !next || r.date < next.date || (r.date === next.date && (parseClockToMinutes(r.time) ?? 0) < (parseClockToMinutes(next.time) ?? 0));
      if (sooner) next = r;
    }
  }
  return { visits, lifetimeValue: cents / 100, noShows, nextAppointment: next ? { date: next.date, time: next.time } : null };
}

/** Sessions left on active memberships, by lower-cased email. */
export async function membershipSessions(ownerId: string, emails: string[]): Promise<Map<string, number>> {
  if (emails.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ email: string; sessions: number }>>`
    SELECT LOWER(u.email) AS email, SUM(p."remainingSessions")::int AS sessions
    FROM merchant_membership_purchases p
    JOIN "user" u ON u.id = p."clientId"
    JOIN businesses b ON b.id = p."businessId"
    WHERE b.owner_id = ${ownerId}::uuid AND LOWER(u.email) = ANY(${emails}::text[])
      AND p.status = 'ACTIVE' AND p."remainingSessions" > 0 AND p."expiresAt" > NOW()
    GROUP BY 1`;
  return new Map(rows.map((r) => [r.email, r.sessions]));
}
