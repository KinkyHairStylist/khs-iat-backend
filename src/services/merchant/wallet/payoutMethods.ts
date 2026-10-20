import prisma from "../../../lib/prisma/prisma";
import type { wallet_payment_methods } from "../../../generated/prisma/client";
import { AppError } from "../../../middlewares/centralAppError";
import type { BankAccountInput } from "../../../schemas/merchant/wallet.schema";
import { walletContext } from "./walletAccount";

// Where a salon's withdrawals are paid: a bank account KHS pays by hand, or a
// connected Stripe / Airwallex account (payoutConnect.ts). Card numbers, CVVs
// and full account numbers never leave the server — only the last four digits.
// New cards can't be added: paying out to a card needs the full number, which
// KHS must not store.

const OPEN_WITHDRAWAL = ["Pending", "Processing", "Submitted"];
const last4 = (v: string | null) => (v ? v.replace(/\s/g, "").slice(-4) : null);

export function methodView(m: wallet_payment_methods) {
  const usable =
    !!m.payoutCurrency &&
    (m.type === "stripe_connect" ? m.stripePayoutsEnabled && !!m.stripeAccountId : m.type === "airwallex_connect" ? !!m.airwallexBeneficiaryId : true);
  return {
    id: m.id,
    type: m.type,
    bankName: m.bankName,
    accountHolderName: m.accountHolderName ?? m.cardHolderName,
    last4: last4(m.accountNumber) ?? m.last4Digits ?? last4(m.cardNumber),
    sortCode: m.type === "bank_account" ? m.sortCode : null,
    payoutCurrency: m.payoutCurrency,
    country: m.country,
    isDefault: m.isDefault,
    stripePayoutsEnabled: m.type === "stripe_connect" ? m.stripePayoutsEnabled : undefined,
    airwallexTransferMethod: m.type === "airwallex_connect" ? m.airwallexTransferMethod : undefined,
    /** Has everything a withdrawal needs (a payout currency, and a finished connection). */
    usable,
    createdAt: m.createdAt.toISOString(),
  };
}
export type PayoutMethodView = ReturnType<typeof methodView>;

export async function listPayoutMethods(userId: string): Promise<PayoutMethodView[]> {
  const ctx = await walletContext(userId);
  const methods = await prisma.wallet_payment_methods.findMany({ where: { walletId: ctx.walletId, isActive: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  return methods.map(methodView);
}

/** One of this wallet's active methods, or 404. */
export async function ownMethod(walletId: string, id: string): Promise<wallet_payment_methods> {
  const method = await prisma.wallet_payment_methods.findFirst({ where: { id, walletId, isActive: true } });
  if (!method) throw AppError.notFound("Payout account");
  return method;
}

export async function addBankAccount(userId: string, input: BankAccountInput): Promise<PayoutMethodView> {
  const ctx = await walletContext(userId);
  const duplicate = await prisma.wallet_payment_methods.findFirst({
    where: { walletId: ctx.walletId, isActive: true, type: "bank_account", accountNumber: input.accountNumber, sortCode: input.sortCode },
    select: { id: true },
  });
  if (duplicate) throw AppError.conflict("This bank account is already saved.", "DUPLICATE_ACCOUNT");

  const created = await prisma.$transaction(async (tx) => {
    const isDefault = input.isDefault || !(await tx.wallet_payment_methods.count({ where: { walletId: ctx.walletId, isActive: true } }));
    if (isDefault) await tx.wallet_payment_methods.updateMany({ where: { walletId: ctx.walletId, isDefault: true }, data: { isDefault: false } });
    return tx.wallet_payment_methods.create({
      data: {
        walletId: ctx.walletId, type: "bank_account", accountHolderName: input.accountHolderName, bankName: input.bankName,
        accountNumber: input.accountNumber, sortCode: input.sortCode, payoutCurrency: input.payoutCurrency, country: ctx.country, isDefault, isActive: true,
      },
    });
  });
  return methodView(created);
}

/** Adds (or changes) the payout currency on a saved bank account or card — accounts saved before currencies existed have none. */
export async function setPayoutCurrency(userId: string, id: string, payoutCurrency: string): Promise<PayoutMethodView> {
  const ctx = await walletContext(userId);
  const method = await ownMethod(ctx.walletId, id);
  // A connected account's currency is decided by Stripe / Airwallex.
  if (method.type === "stripe_connect" || method.type === "airwallex_connect") {
    throw AppError.badRequest("This account's currency is set by its provider.", "CURRENCY_FIXED");
  }
  const updated = await prisma.wallet_payment_methods.update({ where: { id: method.id }, data: { payoutCurrency, updatedAt: new Date() } });
  return methodView(updated);
}

export async function setDefaultMethod(userId: string, id: string): Promise<void> {
  const ctx = await walletContext(userId);
  const method = await ownMethod(ctx.walletId, id);
  await prisma.$transaction([
    prisma.wallet_payment_methods.updateMany({ where: { walletId: ctx.walletId, isDefault: true }, data: { isDefault: false } }),
    prisma.wallet_payment_methods.update({ where: { id: method.id }, data: { isDefault: true } }),
  ]);
}

/** Removes a payout account (kept on file for past withdrawals); not while a withdrawal to it is under way. */
export async function removeMethod(userId: string, id: string): Promise<void> {
  const ctx = await walletContext(userId);
  const method = await ownMethod(ctx.walletId, id);
  const inUse = await prisma.withdrawals.count({ where: { bankDetailsId: method.id, status: { in: OPEN_WITHDRAWAL } } });
  if (inUse) throw AppError.conflict("A withdrawal to this account is still under way. Remove it once that's finished.", "METHOD_IN_USE");
  await prisma.wallet_payment_methods.update({ where: { id: method.id }, data: { isActive: false, isDefault: false, updatedAt: new Date() } });
}
