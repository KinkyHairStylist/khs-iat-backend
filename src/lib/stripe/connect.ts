import type Stripe from "stripe";
import { STRIPE_CONNECT_ENABLED } from "../../config/env";
import { AppError } from "../../middlewares/centralAppError";
import { client, stripeFailed } from "./index";

// Stripe Connect Express accounts — the automatic payout rail for Australian
// salons. The salon enters its bank details on Stripe's own pages; KHS only
// keeps the account id.

export const stripeConnectEnabled = (): boolean => STRIPE_CONNECT_ENABLED;

function connect(): Stripe {
  if (!STRIPE_CONNECT_ENABLED) throw new AppError("Stripe payouts aren't available right now.", 503, "STRIPE_CONNECT_DISABLED");
  return client();
}

export async function createConnectedAccount(input: { businessId: string; email?: string | null; country: string }): Promise<Stripe.Account> {
  try {
    return await connect().accounts.create({
      type: "express",
      country: input.country,
      email: input.email ?? undefined,
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      metadata: { businessId: input.businessId },
    });
  } catch (err) {
    throw stripeFailed("connected account create", err, { businessId: input.businessId });
  }
}

/** A one-time link to Stripe's hosted onboarding for the account. */
export async function createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  try {
    const link = await connect().accountLinks.create({ account: accountId, return_url: returnUrl, refresh_url: refreshUrl, type: "account_onboarding" });
    return link.url;
  } catch (err) {
    throw stripeFailed("account link create", err, { accountId });
  }
}

export async function retrieveAccount(accountId: string): Promise<Stripe.Account> {
  try {
    return await connect().accounts.retrieve(accountId);
  } catch (err) {
    throw stripeFailed("account retrieve", err, { accountId });
  }
}

/**
 * Moves money from KHS's Stripe balance to the salon's account. The idempotency
 * key is the withdrawal's id, so two clicks can never send it twice.
 */
export async function createTransfer(input: { amountCents: number; currency: string; destination: string; withdrawalId: string }): Promise<Stripe.Transfer> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw AppError.badRequest("The payout amount is invalid.", "INVALID_AMOUNT");
  try {
    return await connect().transfers.create(
      { amount: input.amountCents, currency: input.currency.toLowerCase(), destination: input.destination, metadata: { withdrawalId: input.withdrawalId } },
      { idempotencyKey: `withdrawal-${input.withdrawalId}` },
    );
  } catch (err) {
    throw stripeFailed("transfer create", err, { withdrawalId: input.withdrawalId });
  }
}
