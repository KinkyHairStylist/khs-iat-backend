import { MERCHANT_APP_URL } from "../../../config/env";
import { beneficiaryFields, createBeneficiary, getFormSchema } from "../../../lib/airwallex";
import prisma from "../../../lib/prisma/prisma";
import { createConnectedAccount, createOnboardingLink, retrieveAccount } from "../../../lib/stripe/connect";
import { AppError } from "../../../middlewares/centralAppError";
import { notifyUser } from "../../notificationsService";
import { methodView, type PayoutMethodView } from "./payoutMethods";
import { airwallexCorridor, availableRail, PAYOUT_CURRENCIES } from "./payoutRails";
import { walletContext, type WalletContext } from "./walletAccount";

// Connecting an automatic payout account. The rail always comes from the
// salon's business country on file, never from the request.

const WALLET_PAGE = `${MERCHANT_APP_URL}/merchant/dashboard/wallet`;

async function contextFor(userId: string, rail: "stripe" | "airwallex"): Promise<WalletContext & { country: string }> {
  const ctx = await walletContext(userId);
  if (!ctx.country) throw AppError.badRequest("Add your business country in Settings before connecting a payout account.", "NO_COUNTRY");
  if (availableRail(ctx.country) !== rail) {
    throw AppError.badRequest(rail === "stripe" ? "Stripe payouts aren't available for your country." : "Airwallex payouts aren't available for your country.", "RAIL_UNAVAILABLE");
  }
  return { ...ctx, country: ctx.country };
}

/**
 * Stripe's hosted onboarding link. The Express account is created the first
 * time (an unfinished one is reused rather than stranding a second account).
 */
export async function stripeOnboardingLink(userId: string): Promise<{ url?: string; alreadyConnected?: boolean }> {
  const ctx = await contextFor(userId, "stripe");
  const existing = await prisma.wallet_payment_methods.findFirst({ where: { walletId: ctx.walletId, type: "stripe_connect", isActive: true } });
  if (existing?.stripePayoutsEnabled) return { alreadyConnected: true };

  let accountId = existing?.stripeAccountId;
  if (!accountId) {
    accountId = (await createConnectedAccount({ businessId: ctx.businessId, email: ctx.ownerEmail, country: ctx.country })).id;
    if (existing) {
      await prisma.wallet_payment_methods.update({ where: { id: existing.id }, data: { stripeAccountId: accountId, updatedAt: new Date() } });
    } else {
      await prisma.wallet_payment_methods.create({
        data: { walletId: ctx.walletId, type: "stripe_connect", stripeAccountId: accountId, stripePayoutsEnabled: false, country: ctx.country, isActive: true, isDefault: false },
      });
    }
  }
  return { url: await createOnboardingLink(accountId, `${WALLET_PAGE}?stripeReturn=1`, `${WALLET_PAGE}?stripeRefresh=1`) };
}

/**
 * Reads the account's state from Stripe (when the salon comes back from
 * onboarding), so payouts open up without waiting for a webhook.
 */
export async function syncStripeAccount(userId: string): Promise<PayoutMethodView | null> {
  const ctx = await walletContext(userId);
  const method = await prisma.wallet_payment_methods.findFirst({ where: { walletId: ctx.walletId, type: "stripe_connect", isActive: true } });
  if (!method?.stripeAccountId || availableRail(ctx.country) !== "stripe") return method ? methodView(method) : null;

  const account = await retrieveAccount(method.stripeAccountId);
  const enabled = !!account.payouts_enabled;
  const currency = account.default_currency?.toUpperCase();
  const updated = await prisma.wallet_payment_methods.update({
    where: { id: method.id },
    data: {
      stripePayoutsEnabled: enabled,
      payoutCurrency: method.payoutCurrency ?? (enabled && currency && (PAYOUT_CURRENCIES as readonly string[]).includes(currency) ? currency : null),
      updatedAt: new Date(),
    },
  });
  if (enabled && !method.stripePayoutsEnabled) {
    notifyUser(ctx.ownerId, {
      title: "Your Stripe payout account is ready",
      message: "Approved withdrawals can now be sent straight to your Stripe account.",
      link: "/merchant/dashboard/wallet",
    });
  }
  return methodView(updated);
}

/** The bank fields Airwallex needs for this salon's country. */
export async function airwallexForm(userId: string) {
  const ctx = await contextFor(userId, "airwallex");
  const corridor = airwallexCorridor(ctx.country);
  const fields = beneficiaryFields(await getFormSchema(corridor)).map((f) => ({
    key: f.field.key,
    label: f.field.label,
    type: f.field.type,
    required: f.required,
    placeholder: f.field.placeholder ?? f.field.example ?? null,
    tip: f.field.tip ?? null,
    default: f.field.default ?? null,
    options: f.field.options ?? [],
  }));
  return { country: ctx.country, currency: corridor.accountCurrency, transferMethod: corridor.transferMethod, fields };
}

/** Saves the salon's Airwallex beneficiary — usable for withdrawals straight away. */
export async function connectAirwallex(userId: string, answers: Record<string, string>): Promise<PayoutMethodView> {
  const ctx = await contextFor(userId, "airwallex");
  const existing = await prisma.wallet_payment_methods.findFirst({ where: { walletId: ctx.walletId, type: "airwallex_connect", isActive: true }, select: { id: true } });
  if (existing) throw AppError.conflict("An Airwallex payout account is already connected. Remove it first to connect a different one.", "ALREADY_CONNECTED");

  const corridor = airwallexCorridor(ctx.country);
  const beneficiary = await createBeneficiary(corridor, answers);
  const created = await prisma.wallet_payment_methods.create({
    data: {
      walletId: ctx.walletId, type: "airwallex_connect", airwallexBeneficiaryId: beneficiary.id, airwallexBeneficiaryDetails: beneficiary.details,
      airwallexTransferMethod: corridor.transferMethod, payoutCurrency: corridor.accountCurrency, country: ctx.country, isActive: true, isDefault: false,
    },
  });
  return methodView(created);
}
