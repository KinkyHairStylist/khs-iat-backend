import prisma, { MONEY_TX_OPTIONS } from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import type { CancelBookingInput } from "../../schemas/bookings.schema";
import { formatMoney } from "../../utils/money";
import { wallClockMs, wallClockNowMs } from "./bookingRulesCheck";
import { cancellationWindowHours } from "./bookingQueryService";
import { announceCancellation } from "./bookingChangeAnnouncements";
import { assertRefundable, claimHeldPayments, forfeitPayments, refundPayments, type ForfeitureSummary, type RefundSummary } from "./cancellationMoney";
import { cancelUnpaidAttempts } from "./cardPaymentSettle";
import { getPaymentSettings } from "./paymentSettings";
import { activeAppointments, loadVisibleOrder, orderServiceNames } from "./orderStore";

// Cancelling a booking. The whole order is cancelled: it was paid for as one,
// so it's refunded (or forfeited) as one. Cancelling one service of an order
// used to refund the whole payment while the rest stayed booked.

const HOUR_MS = 3_600_000;

export async function cancelBooking(userId: string, orderId: string, input: CancelBookingInput) {
  const rows = await loadVisibleOrder(userId, orderId);
  const active = activeAppointments(rows);
  if (active.length === 0) {
    throw AppError.badRequest(rows.every((r) => r.status === "Cancelled") ? "This booking is already cancelled." : "This booking can no longer be cancelled.");
  }

  const salon = rows[0].businesses!;
  const [windowHours, settings] = await Promise.all([cancellationWindowHours(salon.id), getPaymentSettings()]);
  // Early = at least the salon's window before the earliest appointment, in the customer's time.
  const starts = active.map((r) => wallClockMs(r.date, r.time)).filter((ms): ms is number => ms !== null);
  const hoursLeft = starts.length > 0 ? (Math.min(...starts) - wallClockNowMs(input.timezoneOffsetMinutes)) / HOUR_MS : Infinity;
  const early = hoursLeft >= windowHours;
  if (early) await assertRefundable(orderId, settings.earlyCancellationFee);

  // A booking still being paid for was never confirmed, so the salon never heard of it.
  const salonWasTold = active.some((r) => r.status !== "Pending");
  const customer = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, surname: true } });
  const customerName = `${customer?.firstName ?? ""} ${customer?.surname ?? ""}`.trim();

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${orderId}`}))`;
    const cancelled = await tx.appointments.updateMany({
      where: { id: { in: active.map((r) => r.id) }, status: { in: ["Pending", "Confirmed", "Rescheduled"] } },
      data: {
        status: "Cancelled", paymentStatus: "Unpaid", cancelledAt: new Date(), updatedAt: new Date(),
        ...(input.reason ? { cancellationsNote: input.reason } : {}),
      },
    });
    // Someone else (another tab) cancelled it a moment ago.
    if (cancelled.count === 0) throw AppError.badRequest("This booking is already cancelled.");

    const payments = await claimHeldPayments(tx, orderId, early);
    const forfeiture = early
      ? undefined
      : await forfeitPayments(tx, { payments, orderId, ownerId: salon.owner_id, customerName, salonSharePercent: settings.lateCancellationSalonShare });
    return { payments, forfeiture, count: cancelled.count };
  }, MONEY_TX_OPTIONS);

  void cancelUnpaidAttempts(orderId);
  let refund: RefundSummary | undefined;
  if (early && outcome.payments.length > 0) {
    refund = await refundPayments({ payments: outcome.payments, orderId, earlyFee: settings.earlyCancellationFee, note: input.reason });
  }

  announceCancellation(
    { orderId, customerId: userId, businessId: salon.id, serviceNames: orderServiceNames(active), date: active[0].date, time: active[0].time },
    { salonWasTold, ...moneyNotes(refund, outcome.forfeiture, windowHours) },
  );

  return {
    cancelledCount: outcome.count,
    remainingCount: 0,
    ...(refund ? { refund } : {}),
    ...(outcome.forfeiture ? { forfeiture: outcome.forfeiture } : {}),
  };
}

function moneyNotes(refund: RefundSummary | undefined, forfeiture: ForfeitureSummary | undefined, windowHours: number) {
  if (refund) {
    const fee = refund.cancellationFeeWithheld > 0 ? ` (${formatMoney(refund.cancellationFeeWithheld)} cancellation fee withheld)` : "";
    return {
      customerMoneyNote: `A refund of ${formatMoney(refund.amount)} has been issued to your original payment method${fee}.`,
      merchantMoneyNote: `The client was refunded ${formatMoney(refund.amount)}${refund.cancellationFeeWithheld > 0 ? ` after a ${formatMoney(refund.cancellationFeeWithheld)} cancellation fee` : ""}.`,
    };
  }
  if (forfeiture) {
    return {
      customerMoneyNote: `As this cancellation was made within ${windowHours} hours of the appointment, the ${formatMoney(forfeiture.amount)} already paid is non-refundable per our late-cancellation policy.`,
      merchantMoneyNote: `This was inside your ${windowHours}-hour cancellation window, so the ${formatMoney(forfeiture.amount)} paid is not refunded. Your share is ${formatMoney(forfeiture.stylistShare)}.`,
    };
  }
  return {};
}
