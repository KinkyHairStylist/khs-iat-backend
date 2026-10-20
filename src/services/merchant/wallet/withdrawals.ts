import { randomUUID } from "node:crypto";
import { convert } from "../../../lib/currencyRates";
import prisma, { MONEY_TX_OPTIONS } from "../../../lib/prisma/prisma";
import type { withdrawals as WithdrawalRow, wallet_payment_methods } from "../../../generated/prisma/client";
import type { transactions_currency_enum } from "../../../generated/prisma/enums";
import { AppError } from "../../../middlewares/centralAppError";
import { methodView, ownMethod } from "./payoutMethods";
import { airwallexFeeEstimate } from "./payoutRails";
import { walletContext } from "./walletAccount";
import { announceWithdrawalRequested } from "./walletNotices";

// A salon asks KHS to pay out part of its available balance. The amount comes
// off the balance at once (so it can't be spent twice) and waits as "Pending"
// for KHS to review. KHS approves it ("Processing") and pays by hand, or the
// salon sends it to its connected account (withdrawalPayout.ts); KHS can also
// reject it, which returns the money.

const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
export const withdrawalReference = (id: string) => `WD-${id.slice(0, 8).toUpperCase()}`;

type WithdrawalWithMethod = WithdrawalRow & { wallet_payment_methods: wallet_payment_methods | null };

export function withdrawalView(w: WithdrawalWithMethod) {
  const method = w.wallet_payment_methods;
  return {
    id: w.id,
    reference: withdrawalReference(w.id),
    amount: money(w.amount),
    currency: w.currency,
    payoutAmount: w.payoutAmount !== null ? money(w.payoutAmount) : null,
    payoutCurrency: w.payoutCurrency,
    status: w.status,
    payoutMethod: w.payoutMethod,
    payoutReference: w.payoutReference,
    rejectionReason: w.rejectionReason,
    createdAt: w.createdAt.toISOString(),
    paidAt: w.paidAt?.toISOString() ?? null,
    method: method ? methodView(method) : null,
    /** Approved, and its account can receive it automatically — the salon sends it itself. */
    canClaim: w.status === "Processing" && !!method && method.isActive && methodView(method).usable && (method.type === "stripe_connect" || method.type === "airwallex_connect"),
  };
}

export async function listWithdrawals(userId: string) {
  const ctx = await walletContext(userId);
  const rows = await prisma.withdrawals.findMany({ where: { businessId: ctx.businessId }, orderBy: { createdAt: "desc" }, take: 50, include: { wallet_payment_methods: true } });
  return rows.map(withdrawalView);
}

async function usableMethod(walletId: string, id: string) {
  const method = await ownMethod(walletId, id);
  const connected = method.type === "stripe_connect" || method.type === "airwallex_connect";
  if (connected && !methodView(method).usable) throw AppError.badRequest("This payout account isn't ready yet. Finish connecting it first.", "METHOD_NOT_READY");
  if (!method.payoutCurrency) throw AppError.badRequest("Add a payout currency to this account before withdrawing.", "NO_PAYOUT_CURRENCY");
  if (!methodView(method).usable) throw AppError.badRequest("This payout account isn't ready yet. Finish connecting it first.", "METHOD_NOT_READY");
  return method as wallet_payment_methods & { payoutCurrency: string };
}

/** What the salon would receive, in the account's currency. A pure read, safe on every keystroke. */
export async function previewWithdrawal(userId: string, input: { amount: number; methodId: string }) {
  const ctx = await walletContext(userId);
  const method = await usableMethod(ctx.walletId, input.methodId);
  const conversion = await convert(input.amount, ctx.currency, method.payoutCurrency);
  const fee = method.type === "airwallex_connect" ? airwallexFeeEstimate(method.country, method.airwallexTransferMethod) : undefined;
  return {
    amount: input.amount,
    currency: ctx.currency,
    payoutCurrency: method.payoutCurrency,
    exchangeRate: conversion.exchangeRate,
    payoutAmount: conversion.convertedAmount,
    estimatedFee: fee?.amount ?? null,
    feeCurrency: fee?.currency ?? null,
  };
}

export async function requestWithdrawal(userId: string, input: { amount: number; methodId: string }) {
  const ctx = await walletContext(userId);
  const method = await usableMethod(ctx.walletId, input.methodId);
  // The exchange rate is fetched before the transaction so no row is held while a provider answers.
  const conversion = await convert(input.amount, ctx.currency, method.payoutCurrency);
  const converted = method.payoutCurrency !== ctx.currency;
  const id = randomUUID();
  const reference = withdrawalReference(id);

  const withdrawal = await prisma.$transaction(async (tx) => {
    // Takes the money only if it's there, in one statement, so two requests at once can't both spend it.
    const [debited] = await tx.$queryRaw<Array<{ balance: number }>>`
      UPDATE business_wallets
      SET balance = balance - ${input.amount}::numeric, "totalExpenses" = "totalExpenses" + ${input.amount}::numeric, "updatedAt" = NOW()
      WHERE id = ${ctx.walletId}::uuid AND status = 'active' AND balance >= ${input.amount}::numeric
      RETURNING balance::float AS balance`;
    if (!debited) {
      const wallet = await tx.business_wallets.findUniqueOrThrow({ where: { id: ctx.walletId }, select: { status: true } });
      if (wallet.status !== "active") throw AppError.forbidden("Your wallet isn't active. Please contact support.", "WALLET_INACTIVE");
      throw AppError.badRequest("That's more than your available balance.", "INSUFFICIENT_BALANCE");
    }
    // The account may have been changed or removed since it was read above.
    const still = await tx.wallet_payment_methods.findFirst({ where: { id: method.id, walletId: ctx.walletId, isActive: true }, select: { payoutCurrency: true } });
    if (!still || still.payoutCurrency !== method.payoutCurrency) throw AppError.conflict("Your payout account just changed. Please try again.", "METHOD_CHANGED");

    const ledger = await tx.transactions.create({
      data: {
        walletId: ctx.walletId, senderId: ctx.ownerId, amount: input.amount, type: "Withdrawal", method: "Bank", mode: "Web", status: "pending",
        currency: ctx.currency as transactions_currency_enum, referenceId: reference, description: `Withdrawal request for ${ctx.businessName}`,
      },
    });
    return tx.withdrawals.create({
      data: {
        id, businessId: ctx.businessId, businessName: ctx.businessName, bankDetailsId: method.id, amount: input.amount, currency: ctx.currency,
        payoutCurrency: converted ? method.payoutCurrency : null,
        exchangeRate: converted ? conversion.exchangeRate : null,
        payoutAmount: converted ? conversion.convertedAmount : null,
        status: "Pending", currentBalance: debited.balance, requestDate: new Date().toISOString(), transactionId: ledger.id,
      },
      include: { wallet_payment_methods: true },
    });
  }, MONEY_TX_OPTIONS);

  announceWithdrawalRequested({ id, businessId: ctx.businessId, businessName: ctx.businessName, ownerId: ctx.ownerId, amount: input.amount, currency: ctx.currency, reference });
  return withdrawalView(withdrawal);
}

/** Takes back a request KHS hasn't approved yet; the money returns to the balance. */
export async function cancelWithdrawal(userId: string, id: string) {
  const ctx = await walletContext(userId);
  const result = await prisma.$transaction(async (tx) => {
    // Only one cancel can win, so the money is returned once.
    const claimed = await tx.withdrawals.updateMany({ where: { id, businessId: ctx.businessId, status: "Pending" }, data: { status: "Cancelled", reviewedAt: new Date(), updatedAt: new Date() } });
    const row = await tx.withdrawals.findFirst({ where: { id, businessId: ctx.businessId } });
    if (!row) throw AppError.notFound("Withdrawal request");
    if (!claimed.count) throw AppError.conflict(`This request is already ${row.status.toLowerCase()} and can't be cancelled.`, "NOT_CANCELLABLE");
    await tx.$executeRaw`
      UPDATE business_wallets
      SET balance = balance + ${row.amount}::numeric, "totalExpenses" = GREATEST("totalExpenses" - ${row.amount}::numeric, 0), "updatedAt" = NOW()
      WHERE "businessId" = ${ctx.businessId}::uuid`;
    if (row.transactionId) await tx.transactions.updateMany({ where: { id: row.transactionId }, data: { status: "cancelled", updatedAt: new Date() } });
    return tx.withdrawals.findUniqueOrThrow({ where: { id }, include: { wallet_payment_methods: true } });
  }, MONEY_TX_OPTIONS);
  return withdrawalView(result);
}
