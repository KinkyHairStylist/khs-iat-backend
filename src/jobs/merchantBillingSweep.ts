import { DELIVERY_TEAM_EMAIL } from "../config/env";
import { trialEndingSoonEmail } from "../emails/merchantBillingEmails";
import { sendEmailInBackground } from "../lib/emailEngine/sendgrid";
import prisma from "../lib/prisma/prisma";
import { notifySlack } from "../lib/slack";
import { cancelSubscription } from "../lib/stripe/billing";
import { PAST_DUE_GRACE_DAYS, suspendForBilling } from "../services/merchant/billing/billingLifecycle";

// Daily: merchant plan trials and failed payments. Trials with no card get two
// reminders (5 days and 1 day out), then the storefront is suspended when the
// trial ends; a failed plan payment not fixed within the grace period cancels
// the subscription and suspends too. A trial with a card on file is Stripe's
// to convert (its webhooks follow). Each row is claimed with a conditional
// update before anything is sent, so a payment landing mid-sweep wins.

const DAY_MS = 86_400_000;

async function trialReminders(days: 5 | 1): Promise<number> {
  const now = new Date();
  const column = days === 5 ? "trialReminder5DaySentAt" : "trialReminder1DaySentAt";
  const due = await prisma.merchant_subscriptions.findMany({
    where: { status: "trialing", stripeSubscriptionId: null, trialEndsAt: { gte: now, lte: new Date(now.getTime() + days * DAY_MS) }, [column]: null },
    select: { id: true, businessId: true, trialEndsAt: true },
  });
  let sent = 0;
  for (const sub of due) {
    const claimed = await prisma.merchant_subscriptions.updateMany({ where: { id: sub.id, [column]: null, status: "trialing" }, data: { [column]: now } });
    if (!claimed.count || !sub.trialEndsAt) continue;
    const business = await prisma.businesses.findUnique({ where: { id: sub.businessId }, select: { businessName: true, ownerEmail: true } });
    if (!business) continue;
    const daysLeft = Math.max(1, Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS));
    if (business.ownerEmail) {
      sendEmailInBackground({ to: business.ownerEmail, cc: DELIVERY_TEAM_EMAIL || undefined, ...trialEndingSoonEmail({ businessName: business.businessName, daysLeft, trialEndsAt: sub.trialEndsAt }) });
    }
    notifySlack({
      node: "Payment",
      type: "SUBSCRIPTION_UPDATE",
      trigger: `Trial ending in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: ${business.businessName}`,
      body: `• No payment method on file yet\n• Trial ends: ${sub.trialEndsAt.toISOString()}`,
    });
    sent++;
  }
  return sent;
}

async function expiredTrials(): Promise<number> {
  const expired = await prisma.merchant_subscriptions.findMany({
    where: { status: "trialing", stripeSubscriptionId: null, trialEndsAt: { lt: new Date() } },
    select: { id: true, businessId: true },
  });
  let suspended = 0;
  for (const sub of expired) {
    const claimed = await prisma.merchant_subscriptions.updateMany({
      where: { id: sub.id, status: "trialing", stripeSubscriptionId: null },
      data: { status: "canceled", cancelReason: "trial_expired_no_payment_method", updatedAt: new Date() },
    });
    if (!claimed.count) continue;
    await suspendForBilling(sub.businessId, "trial_expired_no_payment_method", "The free trial ended with no payment method on file");
    suspended++;
  }
  return suspended;
}

async function pastDueBeyondGrace(): Promise<number> {
  const cutoff = new Date(Date.now() - PAST_DUE_GRACE_DAYS * DAY_MS);
  const overdue = await prisma.merchant_subscriptions.findMany({
    where: { status: "past_due", pastDueSince: { lt: cutoff } },
    select: { id: true, businessId: true, stripeSubscriptionId: true },
  });
  let suspended = 0;
  for (const sub of overdue) {
    const claimed = await prisma.merchant_subscriptions.updateMany({
      where: { id: sub.id, status: "past_due" },
      data: { status: "canceled", cancelReason: "payment_failed_grace_period_exceeded", updatedAt: new Date() },
    });
    if (!claimed.count) continue;
    if (sub.stripeSubscriptionId) {
      // Its customer.subscription.deleted webhook then finds it already cancelled and changes nothing.
      await cancelSubscription(sub.stripeSubscriptionId).catch((err: Error) =>
        notifySlack({
          node: "Payment",
          severity: "ERROR",
          type: "ERROR_ALERT",
          trigger: `Stripe subscription cancel failed (${sub.businessId})`,
          body: `• The storefront is suspended, but Stripe subscription ${sub.stripeSubscriptionId} couldn't be cancelled, so Stripe may keep billing it. Cancel it by hand.\n• Error: ${err.message}`,
        }),
      );
    }
    await suspendForBilling(sub.businessId, "payment_failed_grace_period_exceeded", `The plan payment failed more than ${PAST_DUE_GRACE_DAYS} days ago`);
    suspended++;
  }
  return suspended;
}

export async function merchantBillingSweep(): Promise<string> {
  // Reminders first, so a trial ending today still gets its 1-day reminder before it's suspended.
  const fiveDay = await trialReminders(5);
  const oneDay = await trialReminders(1);
  const trials = await expiredTrials();
  const pastDue = await pastDueBeyondGrace();
  return `reminders ${fiveDay}+${oneDay}, trials suspended ${trials}, past due suspended ${pastDue}`;
}
