import type Stripe from "stripe";
import { STRIPE_WEBHOOK_SECRET } from "../../config/env";
import { client } from "./index";

/**
 * The verified event from a webhook request's raw body and Stripe-Signature
 * header (Stripe also rejects timestamps older than 5 minutes, so a captured
 * request can't be replayed later). Throws when the secret isn't set or the
 * signature doesn't match.
 */
export function verifyStripeEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
  if (!STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return client().webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
}
