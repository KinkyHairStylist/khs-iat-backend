import { Prisma } from "../../generated/prisma/client";
import prisma from "../../lib/prisma/prisma";
import { getPaymentSettings, type PaymentSettings } from "../bookings/paymentSettings";

// KHS's launch offers (rules agreed 7 Nov 2026; amounts live in the payment settings):
//  - Founding stylist: the first salons KHS approves (foundingSalonLimit, 100) pay no
//    commission for foundingCommissionFreeMonths (2), counted from launch or their
//    approval, whichever is later. Commission only: the acquisition fee still applies.
//  - First booking: a customer's first KHS booking paid by card is firstBookingDiscountRate
//    (3%) off. KHS covers it, so the salon is paid as if there were no discount.

type Db = Prisma.TransactionClient | typeof prisma;

/** Midnight UTC on a YYYY-MM-DD date. */
const dayStart = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** `from` plus `months` calendar months (31 Jan + 1 month = 28/29 Feb, never 3 Mar). */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export interface FoundingStatus {
  isFounding: boolean;
  /** 1 to the founding limit, when founding. */
  foundingNumber: number | null;
  /** When the commission-free months start and end (null when not founding). */
  startsAt: Date | null;
  endsAt: Date | null;
  /** True while the commission-free months are running. */
  active: boolean;
}

/** A salon's founding stylist offer: whether it has one, and when its free months run. */
export function foundingStatus(
  business: { foundingNumber: number | null; approvedAt: Date | null },
  settings: Pick<PaymentSettings, "foundingSalonLimit" | "foundingCommissionFreeMonths" | "launchDate">,
  now = new Date(),
): FoundingStatus {
  const number = business.foundingNumber;
  if (!number || number > settings.foundingSalonLimit || !business.approvedAt) {
    return { isFounding: false, foundingNumber: null, startsAt: null, endsAt: null, active: false };
  }
  const launch = dayStart(settings.launchDate);
  const startsAt = business.approvedAt > launch ? business.approvedAt : launch;
  const endsAt = addMonths(startsAt, settings.foundingCommissionFreeMonths);
  return { isFounding: true, foundingNumber: number, startsAt, endsAt, active: now >= startsAt && now < endsAt };
}

/** The commission % this salon pays on a booking made now: none during its founding months. */
export async function commissionRateFor(db: Db, businessId: string, settings: PaymentSettings, now = new Date()): Promise<number> {
  const business = await db.businesses.findUnique({ where: { id: businessId }, select: { foundingNumber: true, approvedAt: true } });
  return business && foundingStatus(business, settings, now).active ? 0 : settings.commissionRate;
}

/**
 * True when the customer has never had a KHS booking go through: no other order of theirs was
 * paid for, completed or missed. Cancelled and unpaid orders don't count, so the offer isn't lost
 * to a booking that never happened.
 */
export async function isFirstBooking(db: Db, customerId: string, orderId: string): Promise<boolean> {
  const earlier = await db.appointments.findFirst({
    where: {
      client_id: customerId,
      OR: [{ orderId: null }, { orderId: { not: orderId } }],
      AND: [{ OR: [{ paymentStatus: "Paid" }, { status: { in: ["Completed", "No_Show"] } }] }],
    },
    select: { id: true },
  });
  return !earlier;
}

/** The first-booking discount on a booking, in cents: the rate % of the service total. */
export function firstBookingDiscountCents(serviceTotalCents: number, rate: number): number {
  if (serviceTotalCents <= 0 || rate <= 0) return 0;
  return Math.round((serviceTotalCents * rate) / 100);
}

/** What the website shows about the offers (public: no customer or salon details). */
export async function publicOffers(now = new Date()) {
  const settings = await getPaymentSettings();
  const taken = await prisma.businesses.count({ where: { foundingNumber: { not: null, lte: settings.foundingSalonLimit } } });
  const launch = dayStart(settings.launchDate);
  return {
    firstBooking: {
      discountPercent: settings.firstBookingDiscountRate,
      available: settings.firstBookingDiscountRate > 0,
    },
    founding: {
      salonLimit: settings.foundingSalonLimit,
      spotsLeft: Math.max(settings.foundingSalonLimit - taken, 0),
      commissionFreeMonths: settings.foundingCommissionFreeMonths,
      launchDate: settings.launchDate,
      /** For a salon approved today: when its free months would end. */
      endsAtIfApprovedToday: addMonths(now > launch ? now : launch, settings.foundingCommissionFreeMonths).toISOString(),
      available: settings.foundingSalonLimit > taken && settings.foundingCommissionFreeMonths > 0,
    },
  };
}
