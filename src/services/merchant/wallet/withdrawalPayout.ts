import { createTransfer as airwallexTransfer, retrieveTransfer, type TransferMethod } from "../../../lib/airwallex";
import prisma from "../../../lib/prisma/prisma";
import { createTransfer as stripeTransfer } from "../../../lib/stripe/connect";
import { AppError } from "../../../middlewares/centralAppError";
import { availableRail } from "./payoutRails";
import { walletContext, type WalletContext } from "./walletAccount";
import { alertPayoutFailed, announcePayoutSent } from "./walletNotices";
import { withdrawalReference, withdrawalView } from "./withdrawals";

// The salon sends a withdrawal KHS has approved ("Processing") to its own
// connected account. Stripe transfers are final at once ("Completed");
// Airwallex ones are accepted first ("Submitted") and confirmed later with
// refreshPayoutStatus. Each provider call carries an idempotency key, and each
// status change only applies from the state it expects, so repeated or
// simultaneous clicks can't pay twice.

const load = (ctx: WalletContext, id: string) =>
  prisma.withdrawals.findFirst({ where: { id, businessId: ctx.businessId }, include: { wallet_payment_methods: true } });

async function markLedgerCompleted(transactionId: string | null) {
  if (transactionId) await prisma.transactions.updateMany({ where: { id: transactionId }, data: { status: "completed", updatedAt: new Date() } });
}

export async function claimWithdrawal(userId: string, id: string) {
  const ctx = await walletContext(userId);
  const w = await load(ctx, id);
  if (!w) throw AppError.notFound("Withdrawal request");
  if (w.status !== "Processing") throw AppError.conflict(`This withdrawal is ${w.status.toLowerCase()}, not ready to send.`, "NOT_CLAIMABLE");
  if (!withdrawalView(w).canClaim) throw AppError.badRequest("This withdrawal will be paid by KHS by hand.", "MANUAL_PAYOUT");
  const method = w.wallet_payment_methods!;
  const rail = method.type === "stripe_connect" ? "stripe" : "airwallex";
  if (availableRail(ctx.country) !== rail) throw AppError.badRequest("Automatic payouts aren't available right now; KHS will pay this by hand.", "RAIL_UNAVAILABLE");

  const facts = { id: w.id, businessId: ctx.businessId, businessName: ctx.businessName, ownerId: ctx.ownerId, amount: Number(w.amount), currency: w.currency, reference: withdrawalReference(w.id) };

  if (rail === "stripe") {
    const transfer = await stripeTransfer({ amountCents: Math.round(Number(w.amount) * 100), currency: w.currency, destination: method.stripeAccountId!, withdrawalId: w.id }).catch((err: Error) => {
      alertPayoutFailed({ id: w.id, businessName: ctx.businessName, provider: "Stripe" }, err.message);
      throw err;
    });
    const moved = await prisma.withdrawals.updateMany({
      where: { id: w.id, status: "Processing" },
      data: { status: "Completed", payoutMethod: "stripe", payoutReference: transfer.id, paidAt: new Date(), updatedAt: new Date() },
    });
    if (moved.count) {
      await markLedgerCompleted(w.transactionId);
      announcePayoutSent({ ...facts, provider: "Stripe", providerReference: transfer.id });
    }
  } else {
    // After a failed attempt the old transfer's id is kept, so the retry gets a new key; repeats of one attempt share it.
    const retryOf = w.payoutMethod === "airwallex" && w.payoutReference ? `-${w.payoutReference.slice(0, 12)}` : "";
    const transfer = await airwallexTransfer({
      requestId: `${w.id}${retryOf}`,
      beneficiaryId: method.airwallexBeneficiaryId!,
      reference: facts.reference,
      transferMethod: (method.airwallexTransferMethod as TransferMethod) ?? "SWIFT",
      sourceCurrency: w.currency,
      sourceAmount: Number(w.amount),
      transferCurrency: method.payoutCurrency!,
    }).catch((err: Error) => {
      alertPayoutFailed({ id: w.id, businessName: ctx.businessName, provider: "Airwallex" }, err.message);
      throw err;
    });
    await prisma.withdrawals.updateMany({
      where: { id: w.id, status: "Processing" },
      data: { status: "Submitted", payoutMethod: "airwallex", payoutReference: transfer.id, updatedAt: new Date() },
    });
  }
  return withdrawalView((await load(ctx, id))!);
}

/** Checks an Airwallex payout with Airwallex: sent → Completed; failed → back to Processing so it can be retried. */
export async function refreshPayoutStatus(userId: string, id: string) {
  const ctx = await walletContext(userId);
  const w = await load(ctx, id);
  if (!w) throw AppError.notFound("Withdrawal request");
  if (w.status !== "Submitted" || w.payoutMethod !== "airwallex" || !w.payoutReference) return withdrawalView(w);

  const transfer = await retrieveTransfer(w.payoutReference);
  if (transfer.status === "SENT" || transfer.status === "PAID") {
    const moved = await prisma.withdrawals.updateMany({ where: { id: w.id, status: "Submitted" }, data: { status: "Completed", paidAt: new Date(), updatedAt: new Date() } });
    if (moved.count) {
      await markLedgerCompleted(w.transactionId);
      announcePayoutSent({
        id: w.id, businessId: ctx.businessId, businessName: ctx.businessName, ownerId: ctx.ownerId, amount: Number(w.amount), currency: w.currency,
        reference: withdrawalReference(w.id), provider: "Airwallex", providerReference: transfer.id,
      });
    }
  } else if (transfer.status === "FAILED" || transfer.status === "CANCELLED") {
    // Still owed: back to approved, for a retry or a payment by hand.
    const moved = await prisma.withdrawals.updateMany({ where: { id: w.id, status: "Submitted" }, data: { status: "Processing", updatedAt: new Date() } });
    if (moved.count) alertPayoutFailed({ id: w.id, businessName: ctx.businessName, provider: "Airwallex" }, `Transfer ${transfer.id} came back ${transfer.status}${transfer.failure_type ? ` (${transfer.failure_type})` : ""}`);
  }
  return withdrawalView((await load(ctx, id))!);
}
