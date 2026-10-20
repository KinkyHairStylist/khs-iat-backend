import { DELIVERY_TEAM_EMAIL } from "../../../config/env";
import { planLapsedEmail, planPaymentFailedEmail } from "../../../emails/merchantBillingEmails";
import { sendEmailInBackground } from "../../../lib/emailEngine/sendgrid";
import prisma from "../../../lib/prisma/prisma";
import { notifySlack } from "../../../lib/slack";

// What happens to a merchant's plan between visits to the billing page: Stripe's
// subscription webhooks and the daily billing sweep (jobs/merchantBillingSweep).
// Every change only applies from the state it expects, so a webhook redelivery,
// a sweep and a payment arriving together can't undo each other.

/** A plan payment that failed is given this long to be fixed before the storefront is suspended. */
export const PAST_DUE_GRACE_DAYS = 7;

/**
 * Takes an approved storefront offline after its subscription was cancelled
 * (the caller has already marked it cancelled with `reason`), and tells the
 * owner and KHS. A storefront that isn't live is left as it is.
 */
export async function suspendForBilling(businessId: string, reason: string, detail: string): Promise<void> {
  const moved = await prisma.businesses.updateMany({ where: { id: businessId, status: "approved" }, data: { status: "suspended", updatedAt: new Date() } });
  const business = await prisma.businesses.findUnique({ where: { id: businessId }, select: { businessName: true, ownerEmail: true } });
  if (!business) return;
  if (moved.count && business.ownerEmail) {
    sendEmailInBackground({ to: business.ownerEmail, cc: DELIVERY_TEAM_EMAIL || undefined, ...planLapsedEmail({ businessName: business.businessName, reason }) });
  }
  notifySlack({
    node: "Payment",
    type: "SUBSCRIPTION_CANCEL",
    trigger: `Business suspended for billing: ${business.businessName}`,
    body: `• Reason: ${reason}\n• ${detail}${moved.count ? "" : "\n• The storefront wasn't live, so its status was left as it was"}`,
  });
}

const findBySubscription = (stripeSubscriptionId: string) =>
  prisma.merchant_subscriptions.findUnique({ where: { stripeSubscriptionId }, select: { id: true, businessId: true, status: true } });

/** customer.subscription.deleted. One the sweep already cancelled changes nothing. */
export async function onSubscriptionDeleted(stripeSubscriptionId: string): Promise<void> {
  const sub = await findBySubscription(stripeSubscriptionId);
  if (!sub) return;
  const moved = await prisma.merchant_subscriptions.updateMany({
    where: { id: sub.id, status: { not: "canceled" } },
    data: { status: "canceled", cancelReason: "stripe_canceled", updatedAt: new Date() },
  });
  if (moved.count) await suspendForBilling(sub.businessId, "stripe_canceled", `Stripe subscription: ${stripeSubscriptionId}`);
}

/** invoice.payment_failed. Stripe's own retries of the same invoice don't restart the grace period. */
export async function onPlanPaymentFailed(stripeSubscriptionId: string): Promise<void> {
  const sub = await findBySubscription(stripeSubscriptionId);
  if (!sub) return;
  const moved = await prisma.merchant_subscriptions.updateMany({
    where: { id: sub.id, status: { in: ["active", "trialing"] } },
    data: { status: "past_due", pastDueSince: new Date(), updatedAt: new Date() },
  });
  if (!moved.count) return;

  const business = await prisma.businesses.findUnique({ where: { id: sub.businessId }, select: { businessName: true, ownerEmail: true, ownerName: true } });
  if (business?.ownerEmail) {
    sendEmailInBackground({
      to: business.ownerEmail,
      ...planPaymentFailedEmail({ businessName: business.businessName, ownerName: business.ownerName || "there", graceDays: PAST_DUE_GRACE_DAYS }),
    });
  }
  notifySlack({
    node: "Payment",
    severity: "ERROR",
    type: "PAYMENT_FAILURE",
    trigger: `Merchant billing payment failed: ${business?.businessName ?? sub.businessId}`,
    body: `• ${PAST_DUE_GRACE_DAYS}-day grace period started before suspension\n• Stripe subscription: ${stripeSubscriptionId}`,
  });
}

/** invoice.payment_succeeded. A subscription already cancelled here stays cancelled (KHS is alerted instead). */
export async function onPlanPaymentSucceeded(stripeSubscriptionId: string, periodEnd: Date | null): Promise<void> {
  const sub = await findBySubscription(stripeSubscriptionId);
  if (!sub) return;
  const moved = await prisma.merchant_subscriptions.updateMany({
    where: { id: sub.id, status: { not: "canceled" } },
    data: { status: "active", pastDueSince: null, ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}), updatedAt: new Date() },
  });
  notifySlack({
    node: "Payment",
    severity: moved.count ? "INFO" : "ERROR",
    type: moved.count ? "PAYMENT_SUCCESS" : "ERROR_ALERT",
    trigger: moved.count ? `Merchant billing payment succeeded (${sub.businessId})` : `Plan payment on a cancelled subscription (${sub.businessId})`,
    body: moved.count
      ? `• Stripe subscription: ${stripeSubscriptionId}${periodEnd ? `\n• Paid until: ${periodEnd.toISOString().slice(0, 10)}` : ""}`
      : `• Stripe took a payment on ${stripeSubscriptionId}, which KHS had already cancelled.\n• Check the subscription in Stripe and refund or reinstate by hand.`,
  });
}
