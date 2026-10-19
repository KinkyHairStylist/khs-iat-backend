import { Prisma } from "../../generated/prisma/client";

// A booking is saved as Pending/Unpaid the moment a customer picks a time,
// holding the slot while they pay. A hold that's never paid stops counting
// after this long (the same window as the Kinky-Hair-Stylist backend).
// Only customer checkouts expire: a salon's own Pending booking (made for one
// of its client records, no customer account) keeps its time.
export const PENDING_HOLD_MINUTES = 30;

export const holdCutoff = (now = Date.now()) => new Date(now - PENDING_HOLD_MINUTES * 60_000);

/** True while an unpaid Pending booking still holds its slot. */
export const holdIsLive = (createdAt: Date, now = Date.now()) => createdAt.getTime() >= holdCutoff(now).getTime();

/** A booking that takes up time (alias `a`): not cancelled, and not a customer's checkout hold that has run out. */
export function liveBookingSql(): Prisma.Sql {
  return Prisma.sql`a.status <> 'Cancelled' AND (a.status <> 'Pending' OR a.client_id IS NULL OR a."createdAt" >= ${holdCutoff()})`;
}

/** Appointments on a salon's day that take up time. */
export function activeAppointmentsSql(businessId: string, date: string): Prisma.Sql {
  return Prisma.sql`a.business_id = ${businessId}::uuid AND a.date = ${date} AND ${liveBookingSql()}`;
}
