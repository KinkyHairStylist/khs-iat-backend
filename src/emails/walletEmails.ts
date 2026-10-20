import { MERCHANT_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// To a salon owner about their withdrawals. Amounts arrive already formatted.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';
const e = escapeHtml;
const WALLET = `${MERCHANT_APP_URL}/merchant/dashboard/wallet`;

export function withdrawalRequestedEmail(d: { ownerName: string; businessName: string; amount: string; reference: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Withdrawal request received</p>
<h1 ${H1}>We've received your request for ${e(d.amount)}</h1>
<p ${P}>Hi ${e(d.ownerName)},</p>
<p ${P}>Your withdrawal of <strong>${e(d.amount)}</strong> from ${e(d.businessName)}'s wallet is waiting for review. The amount has been set aside from your balance; we'll let you know once it's approved.</p>
<p ${P}>Reference: <strong>${e(d.reference)}</strong></p>
<p ${P}>Changed your mind? You can cancel the request from your wallet until it's approved.</p>
${renderButton(WALLET, "View your wallet")}`;
  return {
    subject: `Withdrawal request received (${d.reference})`,
    html: renderEmailLayout({ previewText: `Your withdrawal of ${d.amount} is waiting for review`, bodyHtml }),
    text: `Hi ${d.ownerName}, your withdrawal of ${d.amount} from ${d.businessName}'s wallet is waiting for review. Reference: ${d.reference}. You can cancel it from your wallet until it's approved: ${WALLET}`,
  };
}

export function payoutSentEmail(d: { ownerName: string; amount: string; reference: string; provider: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Payout sent</p>
<h1 ${H1}>${e(d.amount)} is on its way</h1>
<p ${P}>Hi ${e(d.ownerName)},</p>
<p ${P}>Your withdrawal has been sent to your ${e(d.provider)} account. How long it takes to reach your bank depends on ${e(d.provider)} and your bank.</p>
<p ${P}>Reference: <strong>${e(d.reference)}</strong></p>
${renderButton(WALLET, "View your wallet")}`;
  return {
    subject: `Your payout of ${d.amount} has been sent`,
    html: renderEmailLayout({ previewText: `${d.amount} has been sent to your ${d.provider} account`, bodyHtml }),
    text: `Hi ${d.ownerName}, your withdrawal of ${d.amount} has been sent to your ${d.provider} account. Reference: ${d.reference}.`,
  };
}
