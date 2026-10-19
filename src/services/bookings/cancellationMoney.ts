import prisma from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/centralAppError";
import { refundPaymentIntent } from "../../lib/stripe";
import { notifySlack } from "../../lib/slack";
import { formatMoney } from "../../utils/money";
import { getServiceLogger } from "../../utils/loggerCreator";
import { creditSalonWallet, LEDGER_CURRENCY } from "./ledger";
import { fromCents } from "./paymentQuote";

const logger = getServiceLogger("cancellations");

// What happens to a card payment when a booking is cancelled — the Kinky-Hair-
// Stylist backend's policy:
//  - Before the salon's cancellation window ("early"): refunded, minus the
//    platform's flat early-cancellation fee.
//  - Inside the window ("late"): nothing is refunded; the salon keeps its
//    share (platform setting, 70% by default) and KHS the rest.
// Only card payments KHS is holding are affected. Gift card and membership
// payments are not given back (as before).

type Tx = Prisma.TransactionClient;

export interface RefundSummary { amount: number; currency: string; cancellationFeeWithheld: number }
export interface ForfeitureSummary { amount: number; currency: string; stylistShare: number; khsShare: number }

interface HeldPayment { stripePaymentIntentId: string; bookingAmount: string; currency: string; userId: string; businessId: string }

/** Refuses up front an early cancellation that would leave nothing to refund (as before: an admin reviews those). */
export async function assertRefundable(orderId: string, earlyFee: number): Promise<void> {
  const held = await prisma.stripe_payment_intents.findMany({ where: { orderId, status: "held" }, select: { bookingAmount: true } });
  if (held.some((p) => Math.round(Number(p.bookingAmount) * 100) - Math.round(earlyFee * 100) <= 0)) {
    throw AppError.badRequest(
      `This booking can't be cancelled online: after the ${formatMoney(earlyFee)} cancellation fee there's nothing left to refund. Please contact support.`,
      "NOTHING_TO_REFUND",
    );
  }
}

/** Claims the order's held card payments (inside the cancel transaction), so they're settled exactly once. */
export async function claimHeldPayments(tx: Tx, orderId: string, early: boolean): Promise<HeldPayment[]> {
  return early
    ? tx.$queryRaw<HeldPayment[]>`
        UPDATE stripe_payment_intents SET status = 'refunded', "refundedAt" = NOW(), "updatedAt" = NOW()
        WHERE "orderId" = ${orderId} AND status = 'held'
        RETURNING "stripePaymentIntentId", "bookingAmount"::text AS "bookingAmount", currency, "userId"::text AS "userId", "businessId"::text AS "businessId"`
    : tx.$queryRaw<HeldPayment[]>`
        UPDATE stripe_payment_intents SET status = 'released', "releasedAt" = NOW(), "updatedAt" = NOW()
        WHERE "orderId" = ${orderId} AND status = 'held'
        RETURNING "stripePaymentIntentId", "bookingAmount"::text AS "bookingAmount", currency, "userId"::text AS "userId", "businessId"::text AS "businessId"`;
}

/** Late cancellation (inside the transaction): the salon is paid its share, KHS records the rest. */
export async function forfeitPayments(tx: Tx, input: {
  payments: HeldPayment[]; orderId: string; ownerId: string; customerName: string; salonSharePercent: number;
}): Promise<ForfeitureSummary | undefined> {
  let summary: ForfeitureSummary | undefined;
  for (const p of input.payments) {
    const totalCents = Math.round(Number(p.bookingAmount) * 100);
    const salonCents = Math.round((totalCents * input.salonSharePercent) / 100);
    const khsCents = totalCents - salonCents;
    if (salonCents > 0) {
      await creditSalonWallet(tx, {
        businessId: p.businessId, ownerId: input.ownerId, amountCents: salonCents, senderId: p.userId,
        description: `Late-cancellation forfeiture payout for order ${input.orderId}`, referenceId: p.stripePaymentIntentId, method: "Stripe",
      });
    }
    if (khsCents > 0) {
      await tx.transactions.create({
        data: {
          senderId: p.userId, amount: fromCents(khsCents), type: "Fee", feeSubtype: "LateCancellationForfeiture", currency: LEDGER_CURRENCY,
          description: `KHS share of late-cancellation forfeiture for order ${input.orderId}`, mode: "Web", referenceId: input.orderId,
          status: "completed", method: "Stripe", service: "Booking-Fee", customerName: input.customerName,
        },
      });
    }
    summary = { amount: fromCents(totalCents), currency: p.currency.toUpperCase(), stylistShare: fromCents(salonCents), khsShare: fromCents(khsCents) };
  }
  return summary;
}

/**
 * Early cancellation (after the transaction): refunds each claimed payment
 * minus the fee, and records the refund. A failed refund is flagged to KHS on
 * Slack — the booking is already cancelled, so the money needs a person.
 */
export async function refundPayments(input: { payments: HeldPayment[]; orderId: string; earlyFee: number; note?: string }): Promise<RefundSummary | undefined> {
  let summary: RefundSummary | undefined;
  for (const p of input.payments) {
    const paidCents = Math.round(Number(p.bookingAmount) * 100);
    const feeCents = Math.min(paidCents, Math.round(input.earlyFee * 100));
    const refundCents = paidCents - feeCents;
    try {
      const refundId = await refundPaymentIntent(p.stripePaymentIntentId, "booking cancelled", refundCents);
      const debit = await prisma.transactions.findFirst({
        where: { referenceId: p.stripePaymentIntentId, service: "Booking", method: "Stripe" },
        select: { id: true },
      });
      if (debit) {
        const reason = input.note || "Booking cancelled before completion";
        const adminNote = `Stripe refund ${refundId} (${formatMoney(fromCents(feeCents))} cancellation fee withheld)`;
        // A refund request may already be on the payment (a pending row with nothing refunded): it's settled by this refund.
        await prisma.refunds.upsert({
          where: { transactionId: debit.id },
          create: {
            transactionId: debit.id, userId: p.userId, amount: fromCents(refundCents), currency: p.currency.toUpperCase(),
            reason, adminNote, status: "processed", refundMethod: "card_refund",
          },
          update: { amount: { increment: fromCents(refundCents) }, adminNote, status: "processed", refundMethod: "card_refund", updatedAt: new Date() },
        });
      }
      summary = { amount: fromCents(refundCents), currency: p.currency.toUpperCase(), cancellationFeeWithheld: fromCents(feeCents) };
    } catch (err) {
      logger.error("Cancellation refund failed", { orderId: input.orderId, error: (err as Error).message });
      notifySlack({
        node: "Payment", severity: "CRITICAL", type: "ERROR_ALERT",
        trigger: `Cancellation refund failed for order ${input.orderId}`,
        body: `• The booking was cancelled, but the Stripe refund failed — the customer's money is stranded and isn't retried.
          • Payment: ${p.stripePaymentIntentId}
          • Refund due: ${formatMoney(fromCents(refundCents))}
          • Error: ${(err as Error).message}`,
      });
    }
  }
  return summary;
}
