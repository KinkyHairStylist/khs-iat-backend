import prisma, { MONEY_TX_OPTIONS } from "../../../lib/prisma/prisma";
import { AppError } from "../../../middlewares/centralAppError";
import { formatMoney } from "../../../utils/money";
import { wallClockMs, wallClockNowMs } from "../../bookings/bookingRulesCheck";
import { claimHeldPayments, refundPayments } from "../../bookings/cancellationMoney";
import { cancelUnpaidAttempts } from "../../bookings/cardPaymentSettle";
import { requireMerchantBusiness, type MerchantBusiness } from "../merchantBusiness";
import { releaseHeldPayments } from "./bookingSettlement";
import { announceSalonChange, type SalonChange } from "./salonBookingAnnouncements";
import { fullName, isStillBooked, loadSalonOrder, lockOrder, orderKey, serviceNamesOf, type SalonOrder } from "./salonOrder";

// What the salon does with a booking: accept it, cancel it, finish it, or
// mark a no-show. Each acts on the whole order under its lock, and only from
// the statuses it makes sense from (the old endpoints flipped any booking to
// any status: a cancelled booking could be "accepted" back, a completed one
// cancelled, and a salon cancelling a paid booking left the customer's money held).

const CHANGED = "This booking changed a moment ago. Please refresh and try again.";

export function changeOf(business: MerchantBusiness, order: SalonOrder): SalonChange {
  return {
    orderId: order.orderId, businessId: business.id, businessName: business.businessName, ownerId: business.ownerId,
    customerId: order.opened.client_id, businessClientId: order.opened.business_client_id,
    serviceNames: serviceNamesOf(order.rows), date: order.opened.date, time: order.opened.time,
  };
}

/** A customer's unpaid booking is their checkout in progress: it confirms itself when they pay. */
const isCustomerCheckout = (order: SalonOrder) => order.rows.some((r) => r.status === "Pending" && r.client_id && r.paymentStatus === "Unpaid");

/** Accepts one of the salon's own Pending bookings (older bookings were created Pending). */
export async function acceptBooking(userId: string, appointmentId: string) {
  const business = await requireMerchantBusiness(userId);
  const order = await loadSalonOrder(business.id, appointmentId);
  if (isCustomerCheckout(order)) {
    throw AppError.badRequest("This client is still paying online. The booking confirms itself once they pay.", "CUSTOMER_CHECKOUT");
  }
  const pending = order.rows.filter((r) => r.status === "Pending");
  if (pending.length === 0) throw AppError.badRequest("Only a pending booking can be accepted.", "NOT_PENDING");

  const accepted = await prisma.appointments.updateMany({
    where: { id: { in: pending.map((r) => r.id) }, status: "Pending" },
    data: { status: "Confirmed", updatedAt: new Date() },
  });
  if (accepted.count !== pending.length) throw AppError.conflict(CHANGED, "BOOKING_CHANGED");
  announceSalonChange(changeOf(business, order), { kind: "accepted" });
  return { status: "Confirmed" };
}

/**
 * The salon cancels (or rejects) a booking. The customer did nothing wrong, so
 * a card payment KHS is holding is refunded in full — no cancellation fee.
 */
export async function cancelBooking(userId: string, appointmentId: string, reason?: string) {
  const business = await requireMerchantBusiness(userId);
  const order = await loadSalonOrder(business.id, appointmentId);
  const active = order.rows.filter(isStillBooked);
  if (active.length === 0) throw AppError.badRequest("This booking can no longer be cancelled.", "NOT_CANCELLABLE");

  const payments = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderKey(order));
    const cancelled = await tx.appointments.updateMany({
      where: { id: { in: active.map((r) => r.id) }, status: { in: ["Pending", "Confirmed", "Rescheduled"] } },
      data: { status: "Cancelled", cancelledAt: new Date(), updatedAt: new Date(), cancellationsNote: reason ?? "Cancelled by the salon" },
    });
    if (cancelled.count !== active.length) throw AppError.conflict(CHANGED, "BOOKING_CHANGED");
    return order.orderId ? claimHeldPayments(tx, order.orderId, true) : [];
  }, MONEY_TX_OPTIONS);

  let refunded: number | undefined;
  if (order.orderId) {
    void cancelUnpaidAttempts(order.orderId);
    if (payments.length > 0) {
      const refund = await refundPayments({ payments, orderId: order.orderId, earlyFee: 0, note: reason || "Cancelled by the salon" });
      refunded = refund?.amount;
    }
  }
  announceSalonChange(changeOf(business, order), {
    kind: "cancelled",
    reason,
    moneyNote: refunded !== undefined ? `A full refund of ${formatMoney(refunded)} has been issued to your original payment method.` : undefined,
  });
  return { status: "Cancelled", ...(refunded !== undefined ? { refunded } : {}) };
}

/** Customer name for the ledger rows. */
async function customerNameOf(order: SalonOrder): Promise<string> {
  if (!order.opened.client_id) return "";
  const u = await prisma.user.findUnique({ where: { id: order.opened.client_id }, select: { firstName: true, surname: true } });
  return fullName(u?.firstName, u?.surname);
}

/**
 * Ends a Confirmed/Rescheduled booking: Completed (served) or No Show. Either
 * way the salon held the slot, so it's paid what KHS was holding. Rows move
 * from the expected statuses only, so a double click can't pay out twice.
 */
async function finish(userId: string, appointmentId: string, outcome: "Completed" | "No Show", opts: { notes?: string; timezoneOffsetMinutes?: number }) {
  const business = await requireMerchantBusiness(userId);
  const order = await loadSalonOrder(business.id, appointmentId);
  const due = order.rows.filter((r) => r.status === "Confirmed" || r.status === "Rescheduled");
  if (due.length === 0) {
    throw AppError.badRequest(
      `Only a confirmed booking can be ${outcome === "Completed" ? "completed" : "marked as a no-show"}${order.opened.status === "Pending" ? " — accept it first" : ""}.`,
      "NOT_CONFIRMED",
    );
  }

  const now = wallClockNowMs(opts.timezoneOffsetMinutes);
  const start = Math.min(...due.map((r) => wallClockMs(r.date, r.time) ?? Infinity));
  const dayStart = wallClockMs(order.opened.date, "12:00 AM") ?? Infinity;
  if (outcome === "Completed" && dayStart > now) throw AppError.badRequest("A booking can't be completed before its day.", "TOO_EARLY");
  if (outcome === "No Show" && start > now) throw AppError.badRequest("A client can only be marked as a no-show once the appointment has started.", "TOO_EARLY");

  const customerName = await customerNameOf(order);
  const staff = [...new Map(due.flatMap((r) => r.appointment_staff.map(({ staff: s }) => [s.id, s] as const))).values()];
  const entry = JSON.stringify([{ type: outcome === "Completed" ? "completed" : "no_show", at: new Date().toISOString(), by: "salon", ...(opts.notes ? { note: opts.notes } : {}) }]);

  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderKey(order));
    const ids = due.map((r) => r.id);
    const moved = await tx.$executeRaw`
      UPDATE appointments SET
        status = ${outcome}::appointments_status_enum, "paymentStatus" = 'Paid', "updatedAt" = NOW(),
        timeline = COALESCE(timeline, '[]'::jsonb) || ${entry}::jsonb
      WHERE id = ANY(${ids}::uuid[]) AND status IN ('Confirmed', 'Rescheduled')`;
    if (moved !== ids.length) throw AppError.conflict(CHANGED, "BOOKING_CHANGED");
    if (order.orderId) await releaseHeldPayments(tx, { orderId: order.orderId, ownerId: business.ownerId, customerName, staff });
  }, MONEY_TX_OPTIONS);

  announceSalonChange(changeOf(business, order), { kind: outcome === "Completed" ? "completed" : "no-show" });
  return { status: outcome };
}

export const completeBooking = (userId: string, appointmentId: string, opts: { notes?: string; timezoneOffsetMinutes?: number }) =>
  finish(userId, appointmentId, "Completed", opts);

export const markNoShow = (userId: string, appointmentId: string, opts: { timezoneOffsetMinutes?: number }) =>
  finish(userId, appointmentId, "No Show", opts);
