import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import { retrievePaymentIntent } from "../../lib/stripe";
import type { StartPaymentInput } from "../../schemas/bookings.schema";
import { assertGiftCardSpendable, findGiftCard } from "../customer/giftCardsService";
import { allowsDeposit } from "./bookingQueryService";
import { holdIsLive } from "./bookingHolds";
import { cancelUnpaidAttempts, settleOutstandingPayments, settlePaidIntent } from "./cardPaymentSettle";
import { startCardPayment } from "./cardPaymentStart";
import { getPaymentSettings } from "./paymentSettings";
import { fromCents, quotePayment, type PaymentQuote } from "./paymentQuote";
import { confirmFreeBooking, payWithGiftCard } from "./payWithoutCard";
import { payWithMembership } from "./payWithMembership";
import { isOrderConfirmed, loadCustomerOrder, orderTotalCents } from "./orderStore";

// Paying for a booking from the payment page.

const alreadyConfirmed = () => AppError.conflict("This booking is already confirmed.", "ALREADY_CONFIRMED");

/** The amounts the payment page shows, in currency units. */
const quoteView = (q: PaymentQuote, depositOnly: boolean) => ({
  depositOnly,
  serviceTotal: fromCents(q.serviceTotalCents),
  giftCardApplied: fromCents(q.giftCardAppliedCents),
  processingFee: fromCents(q.processingFeeCents),
  payNow: fromCents(q.cardChargeCents),
  balanceDue: fromCents(q.balanceDueCents),
});

/**
 * Starts paying for the customer's order. Free and fully gift-card-covered
 * bookings are confirmed straight away; otherwise a card payment is started
 * and its client secret returned for Stripe Elements.
 */
export async function startPayment(userId: string, orderId: string, input: StartPaymentInput) {
  const rows = await loadCustomerOrder(userId, orderId);
  if (isOrderConfirmed(rows)) throw alreadyConfirmed();
  if (rows.every((r) => r.status === "Cancelled")) {
    throw AppError.badRequest("This booking was cancelled. Please choose a time again.", "BOOKING_CANCELLED");
  }
  // Paid already (a reload before we heard back)? Settle it instead of charging again.
  if (await settleOutstandingPayments(orderId)) throw alreadyConfirmed();

  const first = rows[0];
  const salon = first.businesses!;
  if (!holdIsLive(first.createdAt)) {
    await releaseOrder(orderId, "Payment not completed in time — booking expired");
    throw AppError.badRequest("Your hold on this time ran out. Please choose a time again.", "HOLD_EXPIRED");
  }
  if (input.depositOnly && input.giftCard) throw AppError.badRequest("A deposit can't be combined with a gift card.");
  if (input.depositOnly && !(await allowsDeposit(salon.id))) throw AppError.badRequest("This salon doesn't take deposits. Please pay in full.");

  const customer = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, surname: true, email: true } });
  const party = { customerId: userId, ownerId: salon.owner_id, customerName: `${customer?.firstName ?? ""} ${customer?.surname ?? ""}`.trim() };
  const totalCents = orderTotalCents(rows);

  if (input.membershipPurchaseId) {
    await cancelUnpaidAttempts(orderId);
    await payWithMembership({ orderId, rows, membershipPurchaseId: input.membershipPurchaseId, party });
    // Nothing is charged: the sessions were paid for when the membership was bought.
    const quote = { depositOnly: false, serviceTotal: fromCents(totalCents), giftCardApplied: 0, processingFee: 0, payNow: 0, balanceDue: 0, paidWithMembership: true };
    return { kind: "confirmed" as const, quote };
  }

  if (totalCents <= 0) {
    await confirmFreeBooking(orderId);
    return { kind: "confirmed" as const, quote: quoteView(quotePayment({ serviceTotalCents: 0, passthroughRate: 0, passthroughFixedFee: 0 }), false) };
  }

  let giftCardBalanceCents = 0;
  if (input.giftCard) {
    const card = await findGiftCard(input.giftCard);
    assertGiftCardSpendable(card, salon.id);
    giftCardBalanceCents = Math.round(Number(card.remainingAmount.toString()) * 100);
  }

  const settings = await getPaymentSettings();
  const quote = quotePayment({
    serviceTotalCents: totalCents,
    giftCardBalanceCents,
    depositOnly: input.depositOnly,
    passthroughRate: settings.stripePassthroughRate,
    passthroughFixedFee: settings.stripePassthroughFixedFee,
  });

  if (quote.cardChargeCents === 0 && input.giftCard) {
    await cancelUnpaidAttempts(orderId);
    await payWithGiftCard({ orderId, code: input.giftCard, businessId: salon.id, planTier: salon.planTier, party, totalCents });
    return { kind: "confirmed" as const, quote: quoteView(quote, false) };
  }

  const card = await startCardPayment({
    orderId, businessId: salon.id, planTier: salon.planTier, party, email: customer?.email ?? null,
    quote, depositOnly: input.depositOnly, giftCardCode: input.giftCard ?? null,
  });
  return { kind: "card" as const, ...card, quote: quoteView(quote, input.depositOnly) };
}

/**
 * After Stripe Elements confirms the payment in the browser: settles it if
 * Stripe says it's paid. `confirmed: false` while Stripe is still processing.
 */
export async function completeCardPayment(userId: string, orderId: string) {
  const rows = await loadCustomerOrder(userId, orderId);
  if (isOrderConfirmed(rows)) return { confirmed: true };

  const latest = await prisma.stripe_payment_intents.findFirst({
    where: { orderId, userId },
    orderBy: { createdAt: "desc" },
    select: { stripePaymentIntentId: true },
  });
  if (!latest) throw AppError.notFound("Payment");
  const intent = await retrievePaymentIntent(latest.stripePaymentIntentId);
  if (intent.status !== "succeeded") return { confirmed: false, status: intent.status };
  await settlePaidIntent(intent);
  return { confirmed: true };
}

/** Frees the slot of an order nobody paid for. */
async function releaseOrder(orderId: string, note: string): Promise<void> {
  await cancelUnpaidAttempts(orderId);
  await prisma.appointments.updateMany({
    where: { orderId, status: "Pending", paymentStatus: "Unpaid" },
    data: { status: "Cancelled", cancellationsNote: note, cancelledAt: new Date(), updatedAt: new Date() },
  });
}

/** The customer left the payment page without paying: the time goes back on the calendar. */
export async function abandonBooking(userId: string, orderId: string): Promise<void> {
  const rows = await loadCustomerOrder(userId, orderId);
  if (isOrderConfirmed(rows) || (await settleOutstandingPayments(orderId))) throw alreadyConfirmed();
  await releaseOrder(orderId, "Payment not completed — left before confirming");
}
