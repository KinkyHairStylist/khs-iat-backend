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

/** Attaches a saved card to the customer as its default; returns the attached card's id. */
export async function attachDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<string> {
  try {
    const attached = await client().paymentMethods.attach(paymentMethodId, { customer: customerId });
    await client().customers.update(customerId, { invoice_settings: { default_payment_method: attached.id } });
    return attached.id;
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

/** Ends a subscription at once. One that's already cancelled counts as done. */
export async function cancelSubscription(id: string): Promise<void> {
  try {
    await client().subscriptions.cancel(id);
  } catch (err) {
    if ((err as { code?: string }).code === "resource_missing" || /canceled subscription/i.test((err as Error).message)) return;
    throw stripeFailed("subscription cancel", err, { id });
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

/**
 * A plan subscription for an existing business. With `trialEnd` in the future
 * nothing is charged until then; otherwise the first month is charged now and
 * a declined card fails it outright. `idempotencyKey` makes a retried request
 * return the same subscription instead of creating a second one.
 */
export async function createPlanSubscription(input: {
  customerId: string; priceId: string; trialEnd: Date | null; metadata: Record<string, string>; idempotencyKey: string;
}): Promise<Stripe.Subscription> {
  try {
    return await client().subscriptions.create(
      {
        customer: input.customerId,
        items: [{ price: input.priceId }],
        metadata: input.metadata,
        ...(input.trialEnd ? { trial_end: Math.floor(input.trialEnd.getTime() / 1000) } : { payment_behavior: "error_if_incomplete" as const }),
      },
      { idempotencyKey: input.idempotencyKey },
    );
  } catch (err) {
    const stripeError = err as { type?: string; message?: string };
    if (stripeError.type === "StripeCardError") throw AppError.badRequest(`Your card could not be charged: ${stripeError.message}`, "CARD_DECLINED");
    throw stripeFailed("subscription create", err, { customerId: input.customerId });
  }
}

/** Makes `paymentMethodId` the card a subscription is charged to. */
export async function setSubscriptionPaymentMethod(subscriptionId: string, paymentMethodId: string): Promise<Stripe.Subscription> {
  try {
    return await client().subscriptions.update(subscriptionId, { default_payment_method: paymentMethodId });
  } catch (err) {
    throw stripeFailed("subscription update", err, { subscriptionId });
  }
}

/** Tries the subscription's unpaid invoice again (after a card change). True when it's paid. */
export async function payOpenInvoice(subscription: Stripe.Subscription): Promise<boolean> {
  const invoiceId = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id;
  if (!invoiceId) return false;
  try {
    const invoice = await client().invoices.retrieve(invoiceId);
    if (invoice.status === "paid") return true;
    if (invoice.status !== "open") return false;
    return (await client().invoices.pay(invoiceId)).status === "paid";
  } catch (err) {
    const stripeError = err as { type?: string; message?: string };
    if (stripeError.type === "StripeCardError") throw AppError.badRequest(`Your card could not be charged: ${stripeError.message}`, "CARD_DECLINED");
    throw stripeFailed("invoice pay", err, { invoiceId });
  }
}
