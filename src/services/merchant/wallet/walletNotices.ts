import { payoutSentEmail, withdrawalRequestedEmail } from "../../../emails";
import { sendEmailInBackground } from "../../../lib/emailEngine/sendgrid";
import prisma from "../../../lib/prisma/prisma";
import { notifySlack } from "../../../lib/slack";
import { formatMoney } from "../../../utils/money";
import { notifyUser } from "../../notificationsService";

// Telling the salon (bell + email) and KHS (Slack) about withdrawals. Never
// throws: a failed message must not undo money already moved.

interface WithdrawalFacts {
  id: string;
  businessId: string;
  businessName: string;
  ownerId: string;
  amount: number;
  currency: string;
  reference: string;
}

async function owner(ownerId: string, businessId: string) {
  const [user, business] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { firstName: true, email: true } }),
    prisma.businesses.findUnique({ where: { id: businessId }, select: { ownerEmail: true, ownerName: true } }),
  ]);
  return { email: business?.ownerEmail || user?.email || null, name: user?.firstName || business?.ownerName || "there" };
}

export function announceWithdrawalRequested(w: WithdrawalFacts): void {
  const amount = formatMoney(w.amount, w.currency);
  notifyUser(w.ownerId, {
    title: "Withdrawal request received",
    message: `We've received your withdrawal request for ${amount}. We'll let you know once it's approved.`,
    link: "/merchant/dashboard/wallet",
    metadata: { withdrawalId: w.id },
  });
  notifySlack({
    node: "Payment",
    trigger: `Payout requested: ${w.businessName}`,
    body: `A salon requested a payout. It is waiting for review on Wallets & Payouts.\n• Business: ${w.businessName}\n• Amount: ${amount}\n• Reference: ${w.reference}`,
  });
  owner(w.ownerId, w.businessId)
    .then((o) => o.email && sendEmailInBackground({ to: o.email, ...withdrawalRequestedEmail({ ownerName: o.name, businessName: w.businessName, amount, reference: w.reference }) }))
    .catch(() => undefined);
}

export function announcePayoutSent(w: WithdrawalFacts & { provider: "Stripe" | "Airwallex"; providerReference: string }): void {
  const amount = formatMoney(w.amount, w.currency);
  notifyUser(w.ownerId, {
    title: "Your payout has been sent",
    message: `Your withdrawal of ${amount} has been sent to your ${w.provider} account. Reference: ${w.reference}.`,
    link: "/merchant/dashboard/wallet",
    metadata: { withdrawalId: w.id },
  });
  notifySlack({
    node: "Payment",
    trigger: `Payout sent via ${w.provider}: ${w.businessName}`,
    body: `• Business: ${w.businessName}\n• Amount: ${amount}\n• Withdrawal: ${w.id}\n• ${w.provider} reference: ${w.providerReference}`,
  });
  owner(w.ownerId, w.businessId)
    .then((o) => o.email && sendEmailInBackground({ to: o.email, ...payoutSentEmail({ ownerName: o.name, amount, reference: w.reference, provider: w.provider }) }))
    .catch(() => undefined);
}

export function alertPayoutFailed(w: { id: string; businessName: string; provider: string }, error: string): void {
  notifySlack({
    node: "Payment",
    severity: "ERROR",
    type: "ERROR_ALERT",
    trigger: `Salon payout failed (${w.provider}): ${w.businessName}`,
    body: `The salon tried to send withdrawal ${w.id} to its ${w.provider} account and it failed. It's still approved (Processing) — they can retry, or KHS can pay by hand.\n• Error: ${error}`,
  });
}
