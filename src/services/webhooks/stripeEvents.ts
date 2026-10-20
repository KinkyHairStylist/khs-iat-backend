import type Stripe from "stripe";
import prisma from "../../lib/prisma/prisma";
import { notifySlack } from "../../lib/slack";
import { AppError } from "../../middlewares/centralAppError";
import { formatMoney } from "../../utils/money";
import { getServiceLogger } from "../../utils/loggerCreator";
import { settlePaidIntent } from "../bookings/cardPaymentSettle";
import { completeGiftCardPurchase } from "../customer/giftCardSalesService";
import { completeMembershipPurchase } from "../customer/membershipsService";
import { onPlanPaymentFailed, onPlanPaymentSucceeded, onSubscriptionDeleted } from "../merchant/billing/billingLifecycle";
import { announceDisputeOpened, settleClosedDispute, type DisputeFacts } from "../merchant/wallet/chargebacks";
import { applyStripeAccountEvent } from "../merchant/wallet/payoutConnect";

const logger = getServiceLogger("stripe-webhook");

// What each Stripe event does. Every handler is safe to run again: Stripe
// redelivers events, and the browser usually got there first (the payment
// page completes bookings and purchases itself; the webhook catches the ones
// whose page was closed). A handler that throws makes Stripe retry later.

/**
 * A card payment went through: a booking, a gift card or a membership.
 * Gift card and membership payments say so (and who paid) in their metadata;
 * anything else is settled as a booking if it is one.
 */
async function paymentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
  const { kind, purchaserId } = intent.metadata ?? {};
  if (kind === "gift_card" && purchaserId) {
    try {
      await completeGiftCardPurchase(purchaserId, intent.id);
    } catch (err) {
      // Sold to someone else first: the payment was refunded, which is the whole outcome.
      if (!(err instanceof AppError && err.code === "GIFT_CARD_SOLD")) throw err;
    }
    return;
  }
  if (kind === "membership" && purchaserId) {
    await completeMembershipPurchase(purchaserId, intent.id);
    return;
  }
  await settlePaidIntent(intent);
}

/**
 * A card was declined. Nothing changes: the customer can try another card on
 * the same payment (the Kinky-Hair-Stylist backend marked it failed here, so
 * a second card that worked was never settled by its webhook).
 */
async function paymentFailed(intent: Stripe.PaymentIntent): Promise<void> {
  const booking = await prisma.stripe_payment_intents.findUnique({ where: { stripePaymentIntentId: intent.id }, select: { orderId: true, amount: true, status: true } });
  if (!booking || booking.status !== "pending") return;
  notifySlack({
    node: "Payment",
    type: "PAYMENT_FAILURE",
    trigger: `Card payment declined (order ${booking.orderId})`,
    body: `• Amount: ${formatMoney(booking.amount)}\n• Reason: ${intent.last_payment_error?.message ?? "not given"}\n• The customer can retry with another card.`,
  });
}

// Stripe moved an invoice's subscription under parent.subscription_details in newer API versions.
type InvoiceLike = Stripe.Invoice & { subscription?: string | { id: string } | null };
function invoiceSubscriptionId(invoice: InvoiceLike): string | null {
  const s = invoice.parent?.subscription_details?.subscription ?? invoice.subscription ?? null;
  return typeof s === "string" ? s : s?.id ?? null;
}
/** The end of the period this invoice paid for (its own period_end is the previous period's on renewals). */
function paidUntil(invoice: Stripe.Invoice): Date | null {
  const end = invoice.lines?.data?.[0]?.period?.end ?? invoice.period_end;
  return end ? new Date(end * 1000) : null;
}

const disputeFacts = (d: Stripe.Dispute): DisputeFacts => ({
  id: d.id,
  chargeId: typeof d.charge === "string" ? d.charge : d.charge.id,
  amountCents: d.amount,
  reason: d.reason,
  status: d.status,
});

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded":
      return paymentSucceeded(event.data.object);
    case "payment_intent.payment_failed":
      return paymentFailed(event.data.object);
    case "customer.subscription.deleted":
      return onSubscriptionDeleted(event.data.object.id);
    case "invoice.payment_failed": {
      const id = invoiceSubscriptionId(event.data.object as InvoiceLike);
      return id ? onPlanPaymentFailed(id) : undefined;
    }
    case "invoice.payment_succeeded": {
      const id = invoiceSubscriptionId(event.data.object as InvoiceLike);
      return id ? onPlanPaymentSucceeded(id, paidUntil(event.data.object)) : undefined;
    }
    case "charge.dispute.created":
      return announceDisputeOpened(disputeFacts(event.data.object));
    case "charge.dispute.closed":
      return settleClosedDispute(disputeFacts(event.data.object));
    case "account.updated":
      await applyStripeAccountEvent(event.data.object);
      return;
    default:
      logger.info("Unhandled Stripe event", { type: event.type, id: event.id });
  }
}
