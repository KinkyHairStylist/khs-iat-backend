import type Stripe from "stripe";
import prisma, { MONEY_TX_OPTIONS } from "../../lib/prisma/prisma";
import { cancelPaymentIntent, retrievePaymentIntent } from "../../lib/stripe";
import { notifySlack } from "../../lib/slack";
import { getServiceLogger } from "../../utils/loggerCreator";
import { announceConfirmedBooking } from "./bookingAnnouncements";
import { claimAcquisition } from "./ledger";
import { confirmOrder } from "./orderStore";
import { fromCents } from "./paymentQuote";

const logger = getServiceLogger("card-payment");

// Settling a booking's card payment once Stripe reports it paid. Called right
// after the browser confirms the payment, when the payment page is reopened,
// and by the Kinky-Hair-Stylist backend's Stripe webhook for the same rows —
// so whichever arrives first does the work and the others change nothing.

/**
 * Marks the order paid: the payment moves to "held" (the salon is paid when
 * the appointment is completed), its ledger rows complete, the gift card part
 * is taken off the card, and the one-time acquisition fee is claimed.
 * Returns false when this payment was already settled.
 */
export async function settlePaidIntent(intent: Stripe.PaymentIntent): Promise<boolean> {
  const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : null;
  const giftCode = intent.metadata?.giftCardCode || null;
  const giftCents = Number(intent.metadata?.giftCardCents) || 0;
  let giftShortCents = 0;

  const settled = await prisma.$transaction(async (tx) => {
    // Only one settle wins: the row stays locked until this commits.
    const claimed = await tx.$queryRaw<Array<{ orderId: string; businessId: string; userId: string; acquisition: string }>>`
      UPDATE stripe_payment_intents SET status = 'held', "heldAt" = NOW(), "updatedAt" = NOW(),
             "stripeChargeId" = COALESCE(${chargeId}, "stripeChargeId")
      WHERE "stripePaymentIntentId" = ${intent.id} AND status = 'pending'
      RETURNING "orderId", "businessId"::text AS "businessId", "userId"::text AS "userId", "acquisitionFeeAmount"::text AS acquisition`;
    const spi = claimed[0];
    if (!spi) return null;

    await confirmOrder(tx, spi.orderId);
    await tx.transactions.updateMany({
      where: { referenceId: intent.id, service: { in: ["Booking", "Booking-Fee"] }, status: "pending" },
      data: { status: "completed", updatedAt: new Date() },
    });

    if (giftCode && giftCents > 0) {
      const [card] = await tx.$queryRaw<Array<{ id: string; remaining: string }>>`
        SELECT id, "remainingAmount"::text AS remaining FROM business_gift_cards WHERE code = ${giftCode} FOR UPDATE`;
      const balanceCents = card ? Math.round(Number(card.remaining) * 100) : 0;
      const takenCents = Math.min(balanceCents, giftCents);
      giftShortCents = giftCents - takenCents;
      if (card && takenCents > 0) {
        const left = balanceCents - takenCents;
        await tx.business_gift_cards.update({
          where: { id: card.id },
          data: { remainingAmount: fromCents(left), updatedAt: new Date(), ...(left === 0 ? { status: "Used", redeemedAt: new Date() } : {}) },
        });
      }
    }

    // Another booking may have become this customer's first with the salon meanwhile.
    if (Number(spi.acquisition) > 0 && !(await claimAcquisition(tx, spi.businessId, spi.userId, spi.orderId))) {
      await tx.stripe_payment_intents.update({ where: { stripePaymentIntentId: intent.id }, data: { acquisitionFeeAmount: 0 } });
      await tx.transactions.updateMany({ where: { referenceId: intent.id, feeSubtype: "Acquisition" }, data: { status: "cancelled" } });
    }
    return spi;
  }, MONEY_TX_OPTIONS);

  if (!settled) return false;

  if (giftShortCents > 0) {
    notifySlack({
      node: "Payment",
      severity: "CRITICAL",
      type: "ERROR_ALERT",
      trigger: `Gift card short on booking ${settled.orderId}`,
      body: `• The card payment went through, but gift card ${giftCode} no longer had the ${fromCents(giftCents).toFixed(2)} applied to it.
        • Short by: ${fromCents(giftShortCents).toFixed(2)}
        • The booking was confirmed; the difference needs settling by hand.`,
    });
  }
  void announceConfirmedBooking(settled.orderId, { amountCents: intent.amount_received || intent.amount, method: "Card (Stripe)" });
  return true;
}

/**
 * Checks this order's unsettled card payments with Stripe and settles any
 * that went through. True when the order is now paid.
 */
export async function settleOutstandingPayments(orderId: string): Promise<boolean> {
  const pending = await prisma.stripe_payment_intents.findMany({
    where: { orderId, status: "pending" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { stripePaymentIntentId: true },
  });
  let paid = false;
  for (const { stripePaymentIntentId } of pending) {
    const intent = await retrievePaymentIntent(stripePaymentIntentId);
    if (intent.status === "succeeded") {
      await settlePaidIntent(intent);
      paid = true;
    }
  }
  return paid;
}

/**
 * Cancels this order's earlier unpaid attempts, in Stripe and in the ledger,
 * so an order has one live payment. One being paid right now is left alone.
 * Never throws.
 */
export async function cancelUnpaidAttempts(orderId: string): Promise<void> {
  const attempts = await prisma.stripe_payment_intents.findMany({
    where: { orderId, status: "pending" },
    select: { stripePaymentIntentId: true },
    take: 10,
  });
  await Promise.allSettled(
    attempts.map(async ({ stripePaymentIntentId: id }) => {
      try {
        const intent = await retrievePaymentIntent(id);
        if (intent.status === "succeeded" || intent.status === "processing") return;
        if (intent.status !== "canceled") await cancelPaymentIntent(id);
        await prisma.stripe_payment_intents.updateMany({ where: { stripePaymentIntentId: id, status: "pending" }, data: { status: "cancelled" } });
        await prisma.transactions.updateMany({ where: { referenceId: id, status: "pending" }, data: { status: "cancelled" } });
      } catch (err) {
        logger.warn("Could not cancel an earlier payment attempt", { id, error: (err as Error).message });
      }
    }),
  );
}
