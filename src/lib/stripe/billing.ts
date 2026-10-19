import type Stripe from "stripe";
import { CURRENCY } from "../../config/env";
import { AppError } from "../../middlewares/centralAppError";
import { client, stripeFailed } from "./index";

// Stripe for merchant plans: the customer a merchant pays from, saving their
// card, and the monthly plan subscription.

/** Metadata that marks a Stripe object as made by merchant sign-up for this user. */
export const SIGNUP_PURPOSE = "merchant-signup";

export async function createSignupCustomer(input: { userId: string; email: string; name?: string }): Promise<Stripe.Customer> {
  try {
    return await client().customers.create({ email: input.email, name: input.name, metadata: { userId: input.userId, purpose: SIGNUP_PURPOSE } });
  } catch (err) {
    throw stripeFailed("customer create", err, { userId: input.userId });
  }
}

export async function createBusinessCustomer(input: { businessId: string; email?: string | null; name?: string }): Promise<Stripe.Customer> {
  try {
    return await client().customers.create({ email: input.email ?? undefined, name: input.name, metadata: { businessId: input.businessId } });
  } catch (err) {
    throw stripeFailed("customer create", err, { businessId: input.businessId });
  }
}

export async function retrieveCustomer(id: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
  try {
    return await client().customers.retrieve(id);
  } catch (err) {
    throw stripeFailed("customer retrieve", err, { id });
  }
}

/** A SetupIntent: the browser saves a card against `customerId` with Stripe Elements. */
export async function createCardSetup(customerId: string): Promise<Stripe.SetupIntent> {
  try {
    return await client().setupIntents.create({ customer: customerId, payment_method_types: ["card"] });
  } catch (err) {
    throw stripeFailed("setup intent create", err, { customerId });
  }
}

export async function attachDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
  try {
    await client().paymentMethods.attach(paymentMethodId, { customer: customerId });
    await client().customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
  } catch (err) {
    throw stripeFailed("payment method attach", err, { customerId });
  }
}

export async function listCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
  try {
    return (await client().subscriptions.list({ customer: customerId, status: "all", limit: 10 })).data;
  } catch (err) {
    throw stripeFailed("subscription list", err, { customerId });
  }
}

export async function retrieveSubscription(id: string): Promise<Stripe.Subscription> {
  try {
    return await client().subscriptions.retrieve(id);
  } catch (err) {
    throw stripeFailed("subscription retrieve", err, { id });
  }
}

/** Starts a monthly subscription and charges the first month now; a declined card fails it outright. */
export async function createSubscriptionNow(customerId: string, priceId: string, metadata: Record<string, string>): Promise<Stripe.Subscription> {
  try {
    return await client().subscriptions.create({ customer: customerId, items: [{ price: priceId }], payment_behavior: "error_if_incomplete", metadata });
  } catch (err) {
    const stripeError = err as { type?: string; message?: string };
    if (stripeError.type === "StripeCardError") {
      throw AppError.badRequest(`Your card could not be charged: ${stripeError.message}`, "CARD_DECLINED");
    }
    throw stripeFailed("subscription create", err, { customerId, priceId });
  }
}

export async function priceExists(priceId: string): Promise<boolean> {
  if (!priceId) return false;
  try {
    await client().prices.retrieve(priceId);
    return true;
  } catch {
    return false;
  }
}

/** A new monthly price for a plan, in the platform currency, on a new product. */
export async function createPlanPrice(tier: string, amountCents: number): Promise<Stripe.Price> {
  if (!Number.isInteger(amountCents) || amountCents < 50) throw AppError.internal("This plan's price isn't set up correctly. Please contact support.");
  try {
    const product = await client().products.create({ name: `KHS Merchant Subscription — ${tier}` });
    return await client().prices.create({ product: product.id, unit_amount: amountCents, currency: CURRENCY.toLowerCase(), recurring: { interval: "month" } });
  } catch (err) {
    throw stripeFailed("price create", err, { tier });
  }
}

/** When the paid period ends (recent API versions keep it on the subscription item). */
export function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const seconds =
    (subscription as unknown as { current_period_end?: number }).current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null;
  return seconds ? new Date(seconds * 1000) : null;
}
