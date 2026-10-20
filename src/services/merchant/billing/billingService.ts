import type Stripe from "stripe";
import prisma from "../../../lib/prisma/prisma";
import redis from "../../../lib/redis/redis";
import { notifySlack } from "../../../lib/slack";
import {
  attachDefaultPaymentMethod, createBusinessCustomer, createCardSetup, createPlanSubscription, payOpenInvoice, retrieveSubscription,
  setSubscriptionPaymentMethod, subscriptionPeriodEnd,
} from "../../../lib/stripe/billing";
import { AppError } from "../../../middlewares/centralAppError";
import type { PlanTier } from "../../../utils/merchantPlans";
import { getPlanSettings } from "../plans/planSettings";
import { usablePriceId } from "../setup/signupPaymentService";
import { requireMerchantBusiness, type MerchantBusiness } from "../merchantBusiness";

// The merchant's plan billing after sign-up: choosing (or coming back to) a
// paid plan, and changing the card when a payment fails. One subscription per
// business: a live one is never duplicated, and simultaneous requests are
// serialised. Stripe's answer updates the record at once (the webhook, still in
// the old backend, confirms later renewals).

const LIVE = ["active", "trialing", "past_due", "incomplete"];
// Suspensions the billing sweep (or a cancelled subscription) made; paying again lifts only these.
const BILLING_SUSPENSIONS = ["trial_expired_no_payment_method", "payment_failed_grace_period_exceeded", "stripe_canceled"];

async function withBusinessLock<T>(businessId: string, fn: () => Promise<T>): Promise<T> {
  const key = `merchant-billing-lock:${businessId}`;
  if (!(await redis.set(key, "1", "EX", 120, "NX"))) throw AppError.conflict("Your billing is already being updated. Please wait a moment.", "BILLING_BUSY");
  try {
    return await fn();
  } finally {
    await redis.del(key);
  }
}

/** The business's subscription record with a Stripe customer (created if it was never made). */
async function billingRecord(business: MerchantBusiness) {
  const sub = await prisma.merchant_subscriptions.findUnique({ where: { businessId: business.id } });
  if (!sub) throw AppError.badRequest("Your business hasn't been approved for billing yet. Contact support to get set up.", "NOT_APPROVED");
  if (sub.stripeCustomerId) return { ...sub, stripeCustomerId: sub.stripeCustomerId };
  const owner = await prisma.businesses.findUniqueOrThrow({ where: { id: business.id }, select: { ownerEmail: true } });
  const customer = await createBusinessCustomer({ businessId: business.id, email: owner.ownerEmail, name: business.businessName });
  await prisma.merchant_subscriptions.update({ where: { id: sub.id }, data: { stripeCustomerId: customer.id, updatedAt: new Date() } });
  return { ...sub, stripeCustomerId: customer.id };
}

async function liveSubscription(subscriptionId: string | null): Promise<Stripe.Subscription | null> {
  if (!subscriptionId) return null;
  const s = await retrieveSubscription(subscriptionId).catch(() => null);
  return s && LIVE.includes(s.status) ? s : null;
}

/** A SetupIntent for the billing page's card form. */
export async function startBillingCardSetup(userId: string): Promise<{ clientSecret: string }> {
  const business = await requireMerchantBusiness(userId);
  const sub = await billingRecord(business);
  const setup = await createCardSetup(sub.stripeCustomerId);
  if (!setup.client_secret) throw AppError.internal();
  return { clientSecret: setup.client_secret };
}

/**
 * Starts a paid plan with the saved card. Still inside a Trial or MVP: nothing
 * is charged until it ends. Otherwise the first month is charged now.
 */
export async function subscribeToPlan(userId: string, input: { tier: PlanTier; paymentMethodId: string }) {
  const business = await requireMerchantBusiness(userId);
  return withBusinessLock(business.id, async () => {
    const sub = await billingRecord(business);
    if (await liveSubscription(sub.stripeSubscriptionId)) {
      throw AppError.conflict("You already have a plan. To pay with a different card, update your card instead.", "ALREADY_SUBSCRIBED");
    }
    const settings = await getPlanSettings();
    const price = settings.subscriptionPrices[input.tier];
    if (!price?.priceId) throw AppError.badRequest(`The ${input.tier} plan isn't available to buy yet.`, "PLAN_UNAVAILABLE");

    await attachDefaultPaymentMethod(sub.stripeCustomerId, input.paymentMethodId);
    const trialEnd = sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : null;
    const stripeSub = await createPlanSubscription({
      customerId: sub.stripeCustomerId,
      priceId: await usablePriceId(input.tier, price),
      trialEnd,
      metadata: { businessId: business.id, tier: input.tier, purpose: "merchant-billing" },
      idempotencyKey: `merchant-billing-${business.id}-${input.paymentMethodId}-${input.tier}`,
    });

    const paid = stripeSub.status === "active";
    const reactivated = await prisma.$transaction(async (tx) => {
      await tx.merchant_subscriptions.update({
        where: { id: sub.id },
        data: {
          stripeSubscriptionId: stripeSub.id,
          kind: "paid",
          status: paid ? "active" : "trialing",
          currentPeriodEnd: subscriptionPeriodEnd(stripeSub),
          pastDueSince: null,
          cancelReason: null,
          updatedAt: new Date(),
        },
      });
      await tx.businesses.update({ where: { id: business.id }, data: { planTier: input.tier } });
      // Back from a billing suspension: the storefront goes live again.
      if (paid && business.status === "suspended" && sub.cancelReason && BILLING_SUSPENSIONS.includes(sub.cancelReason)) {
        await tx.businesses.update({ where: { id: business.id }, data: { status: "approved" } });
        return true;
      }
      return false;
    });

    notifySlack({
      node: "Payment",
      trigger: `Merchant chose a paid plan: ${business.businessName}`,
      body: `• Plan: ${input.tier}\n• Charged now: ${paid ? "yes" : `no, after the free period (${trialEnd?.toISOString().slice(0, 10)})`}\n• Stripe subscription: ${stripeSub.id}${reactivated ? "\n• Storefront reactivated after a billing suspension" : ""}`,
    });
    return { status: paid ? "active" : "trialing", reactivated };
  });
}

/** Changes the card a live plan is charged to; a payment that had failed is tried again on the new card. */
export async function updateBillingCard(userId: string, paymentMethodId: string) {
  const business = await requireMerchantBusiness(userId);
  return withBusinessLock(business.id, async () => {
    const sub = await billingRecord(business);
    const live = await liveSubscription(sub.stripeSubscriptionId);
    if (!live) throw AppError.badRequest("You don't have an active plan. Choose a plan instead.", "NO_SUBSCRIPTION");

    const cardId = await attachDefaultPaymentMethod(sub.stripeCustomerId, paymentMethodId);
    const updated = await setSubscriptionPaymentMethod(live.id, cardId);
    if (updated.status !== "past_due" && updated.status !== "incomplete") return { status: sub.status, retried: false };

    const settled = await payOpenInvoice(updated);
    if (settled) {
      const fresh = await retrieveSubscription(live.id);
      await prisma.merchant_subscriptions.update({
        where: { id: sub.id },
        data: { status: "active", pastDueSince: null, currentPeriodEnd: subscriptionPeriodEnd(fresh), updatedAt: new Date() },
      });
      notifySlack({ node: "Payment", trigger: `Merchant fixed a failed plan payment: ${business.businessName}`, body: `• Stripe subscription: ${live.id}` });
    }
    return { status: settled ? "active" : sub.status, retried: true };
  });
}
