import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "../../config/env";
import { getServiceLogger } from "../../utils/loggerCreator";
import { AppError } from "../../middlewares/centralAppError";

const logger = getServiceLogger("stripe-client");

// The SDK accepts an empty key and only fails on the first call, so check up
// front and fail with a clear error instead.
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

if (!stripe) {
  logger.warn("STRIPE_SECRET_KEY is not set — card payments will answer STRIPE_NOT_CONFIGURED until it's configured");
}

/** The Stripe client, or a 503 when Stripe isn't configured. */
export function client(): Stripe {
  if (!stripe) {
    throw new AppError("Card payments aren't available right now. Please try again later.", 503, "STRIPE_NOT_CONFIGURED");
  }
  return stripe;
}

export const stripeFailed = (what: string, err: unknown, context: Record<string, unknown>) => {
  if (err instanceof AppError) return err;
  logger.error(`Stripe ${what} failed`, { ...context, error: (err as Error).message });
  return new AppError("We couldn't reach our payment provider. Please try again in a moment.", 502, "STRIPE_ERROR");
};

/** A card payment for `amountCents` (smallest currency unit) the browser completes with Stripe Elements. */
export async function createPaymentIntent(input: {
  amountCents: number;
  currency: string;
  email?: string | null;
  metadata: Record<string, string>;
}): Promise<Stripe.PaymentIntent> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw AppError.internal();
  }
  try {
    return await client().paymentIntents.create({
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      receipt_email: input.email ?? undefined,
      metadata: input.metadata,
      automatic_payment_methods: { enabled: true },
    });
  } catch (err) {
    throw stripeFailed("payment intent create", err, { orderId: input.metadata.orderId });
  }
}

export async function retrievePaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
  try {
    return await client().paymentIntents.retrieve(id);
  } catch (err) {
    throw stripeFailed("payment intent retrieve", err, { id });
  }
}

/** Cancels a payment that hasn't been paid, so it can't be paid any more. */
export async function cancelPaymentIntent(id: string): Promise<void> {
  try {
    await client().paymentIntents.cancel(id);
  } catch (err) {
    throw stripeFailed("payment intent cancel", err, { id });
  }
}

/** Gives a paid payment back: all of it, or `amountCents` of it. Returns the Stripe refund id. */
/** `idempotencyKey` makes a repeat of the same refund return the first one instead of failing (24 hours, at Stripe). */
export async function refundPaymentIntent(id: string, reason: string, amountCents?: number, idempotencyKey?: string): Promise<string> {
  try {
    const refund = await client().refunds.create(
      {
        payment_intent: id,
        ...(amountCents !== undefined ? { amount: amountCents } : {}),
        reason: "requested_by_customer",
        metadata: { reason },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    return refund.id;
  } catch (err) {
    throw stripeFailed("refund", err, { id });
  }
}
