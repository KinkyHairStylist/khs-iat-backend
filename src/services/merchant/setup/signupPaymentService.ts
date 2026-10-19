import type Stripe from "stripe";
import prisma from "../../../lib/prisma/prisma";
import { AppError } from "../../../middlewares/centralAppError";
import {
  SIGNUP_PURPOSE,
  attachDefaultPaymentMethod,
  createCardSetup,
  createPlanPrice,
  createSignupCustomer,
  createSubscriptionNow,
  listCustomerSubscriptions,
  priceExists,
  retrieveCustomer,
  retrieveSubscription,
  subscriptionPeriodEnd,
} from "../../../lib/stripe/billing";
import { type PlanTier, type SignupOption, revealStatus } from "../../../utils/merchantPlans";
import { getPlanSettings, savePlanPriceId } from "../plans/planSettings";

// The plan step of business setup. No business — and so no merchant — is
// created without a choice, and a paid plan is only accepted once Stripe
// confirms its first payment, so "no payment, no merchant" holds on the server.

export interface SignupChoice {
  option: SignupOption;
  tier?: PlanTier;
  stripeSubscriptionId?: string;
}

/** What a checked choice comes to: the fee tier the business starts on, and what to record once it exists. */
export interface ResolvedSignup {
  option: SignupOption;
  planTier: PlanTier;
  paid?: { customerId: string; subscriptionId: string; currentPeriodEnd: Date | null };
  windowEndsAt?: Date;
}

const ACTIVE = ["active", "trialing"];

/** Paying, step 1: a Stripe customer for this merchant and a SetupIntent to save their card. */
export async function startCardSetup(user: { id: string; email: string; firstName: string | null; surname: string | null }) {
  const name = `${user.firstName ?? ""} ${user.surname ?? ""}`.trim() || undefined;
  const customer = await createSignupCustomer({ userId: user.id, email: user.email, name });
  const setup = await createCardSetup(customer.id);
  if (!setup.client_secret) throw AppError.internal();
  return { clientSecret: setup.client_secret, customerId: customer.id };
}

async function assertCustomerIsTheirs(userId: string, customerId: string): Promise<void> {
  const customer = await retrieveCustomer(customerId);
  if ((customer as Stripe.DeletedCustomer).deleted) throw AppError.forbidden("That payment session is no longer valid. Please start again.");
  if ((customer as Stripe.Customer).metadata?.userId !== userId) throw AppError.forbidden("That payment session belongs to a different account.");
}

/**
 * A stored price id can come from another environment's Stripe account (the
 * settings are shared, Stripe ids aren't). Checked on every purchase; only a
 * missing price is replaced (and saved) so the merchant never sees "No such price".
 */
async function usablePriceId(tier: PlanTier, price: { priceId: string; displayAmount: number }): Promise<string> {
  if (await priceExists(price.priceId)) return price.priceId;
  const created = await createPlanPrice(tier, Math.round(Number(price.displayAmount) * 100));
  await savePlanPriceId(tier, created.id, price.displayAmount);
  return created.id;
}

/**
 * Paying, step 2: charges the first month. Repeating the call (a double click,
 * a retry after a network error) returns the subscription already made instead
 * of charging twice.
 */
export async function subscribeAtSignup(userId: string, input: { tier: PlanTier; paymentMethodId: string; customerId: string }) {
  const settings = await getPlanSettings();
  const price = settings.subscriptionPrices[input.tier];
  if (!price?.priceId) throw AppError.badRequest(`The ${input.tier} plan isn't available to buy yet.`, "PLAN_UNAVAILABLE");

  await assertCustomerIsTheirs(userId, input.customerId);

  const existing = (await listCustomerSubscriptions(input.customerId)).find(
    (s) => s.metadata?.purpose === SIGNUP_PURPOSE && s.metadata?.tier === input.tier && ACTIVE.includes(s.status),
  );
  if (existing) return { subscriptionId: existing.id, customerId: input.customerId };

  await attachDefaultPaymentMethod(input.customerId, input.paymentMethodId);
  const priceId = await usablePriceId(input.tier, price);
  const subscription = await createSubscriptionNow(input.customerId, priceId, { userId, tier: input.tier, purpose: SIGNUP_PURPOSE });
  return { subscriptionId: subscription.id, customerId: input.customerId };
}

/** Checks the chosen start BEFORE the business is created, so a bad or missing payment stops setup here. */
export async function resolveSignup(userId: string, choice: SignupChoice): Promise<ResolvedSignup> {
  const settings = await getPlanSettings();

  if (choice.option === "trial") return { option: "trial", planTier: settings.trialFeeTier };

  if (choice.option === "reveal") {
    const window = revealStatus(settings.revealPeriod);
    if (!window.open || !window.endsAt) throw AppError.badRequest("MVP is closed. Please choose the Trial or a paid plan.", "MVP_CLOSED");
    return { option: "reveal", planTier: settings.revealFeeTier, windowEndsAt: window.endsAt };
  }

  if (!choice.tier || !choice.stripeSubscriptionId) {
    throw AppError.badRequest("Payment is required to become a merchant on a paid plan.", "PAYMENT_REQUIRED");
  }
  const subscription = await retrieveSubscription(choice.stripeSubscriptionId);
  const paid =
    subscription.metadata?.purpose === SIGNUP_PURPOSE &&
    subscription.metadata?.userId === userId &&
    subscription.metadata?.tier === choice.tier &&
    ACTIVE.includes(subscription.status);
  if (!paid) {
    throw AppError.badRequest("We could not confirm your payment. Please try again, or contact support if you were charged.", "PAYMENT_NOT_CONFIRMED");
  }
  const used = await prisma.merchant_subscriptions.findUnique({ where: { stripeSubscriptionId: subscription.id }, select: { id: true } });
  if (used) throw AppError.conflict("That payment has already been used for a business.", "PAYMENT_ALREADY_USED");

  return {
    option: "paid",
    planTier: choice.tier,
    paid: {
      customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      subscriptionId: subscription.id,
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
    },
  };
}
