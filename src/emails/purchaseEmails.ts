import { CUSTOMER_APP_URL, MERCHANT_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// Buying a membership package or a gift card. Same wording as the
// Kinky-Hair-Stylist backend's communication-bulk, gift-card ("purchased") and
// merchant-gift-card-sold templates.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';
const CELL_L = 'style="font-size:14px; color:#52525b; border-bottom:1px solid #e4e4e7;"';
const CELL_R = 'style="font-size:14px; font-weight:600; color:#18181b; border-bottom:1px solid #e4e4e7;"';

const row = (label: string, value: string) => `<tr><td ${CELL_L}>${escapeHtml(label)}</td><td ${CELL_R}>${escapeHtml(value)}</td></tr>`;

/** To the customer once their membership package is paid for. */
export function membershipPurchasedEmail(d: { name: string; packageName: string; sessions: number; businessName: string; expiresOn: string }): RenderedEmail {
  const message = `Your purchase of "${d.packageName}" (${d.sessions} sessions) at ${d.businessName} is confirmed. Your sessions are valid until ${d.expiresOn}.`;
  const bodyHtml = `
<p ${EYEBROW}>Membership purchased</p>
<h1 ${H1}>Your membership package purchase is confirmed</h1>
<p ${P}>Hi ${escapeHtml(d.name)},</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
  <tr><td style="padding:24px 28px; background-color:#fafafa; border-left:4px solid #ED3131; border-radius:8px; font-size:15px; line-height:1.8; color:#3f3f46;">${escapeHtml(message)}</td></tr>
</table>
${renderButton(`${CUSTOMER_APP_URL}/customer/membership`, "View My Memberships")}`;
  return {
    subject: "Your membership package purchase is confirmed",
    html: renderEmailLayout({ previewText: `${d.sessions} sessions at ${d.businessName}`, bodyHtml }),
    text: `Hi ${d.name}, ${message}`,
  };
}

/** To the customer once their gift card is paid for. */
export function giftCardPurchasedEmail(d: { name: string; code: string; value: string; recipientName?: string; senderName?: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Gift card purchased</p>
<h1 ${H1}>Your gift card purchase is confirmed</h1>
<p ${P}>Hi ${escapeHtml(d.name)},</p>
<p style="margin:0 0 8px 0; font-size:15px; line-height:1.6; color:#52525b;">Your gift card has been purchased successfully.</p>
<table style="margin:0 0 24px 0; width:100%; border-collapse:collapse;" cellpadding="8" cellspacing="0">
  ${row("Code", d.code)}${row("Value", d.value)}${d.recipientName ? row("Recipient", d.recipientName) : ""}${d.senderName ? row("From", d.senderName) : ""}
</table>
${renderButton(`${CUSTOMER_APP_URL}/customer/gift/purchase/validate`, "Redeem Gift Card")}`;
  return {
    subject: "Your gift card purchase is confirmed",
    html: renderEmailLayout({ previewText: `Gift card worth ${d.value}`, bodyHtml }),
    text: `Hi ${d.name}, your gift card (${d.code}) worth ${d.value} has been purchased successfully.`,
  };
}

/** To the salon when a customer buys one of its gift cards. */
export function merchantGiftCardSoldEmail(d: { merchantName: string; businessName: string; purchaserName: string; title: string; amount: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Gift card sold</p>
<h1 ${H1}>A customer bought one of your gift cards</h1>
<p ${P}>Hi ${escapeHtml(d.merchantName)},</p>
<p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#52525b;"><strong>${escapeHtml(d.purchaserName)}</strong> bought the gift card <strong>${escapeHtml(d.title)}</strong> from <strong>${escapeHtml(d.businessName)}</strong>. The amount has been added to your wallet.</p>
<table style="margin:0 0 24px 0; width:100%; border-collapse:collapse;" cellpadding="8" cellspacing="0">
  ${row("Gift card:", d.title)}${row("Bought by:", d.purchaserName)}${row("Added to your wallet:", d.amount)}
</table>
<p style="margin:0 0 24px 0; font-size:13px; line-height:1.6; color:#6B7280;">When the customer spends this gift card on a booking, our commission is taken from that booking.</p>
${renderButton(`${MERCHANT_APP_URL}/merchant/dashboard/gift-management`, "View in Merchant Dashboard")}`;
  return {
    subject: `Gift card sold (${d.amount}) – ${d.businessName}`,
    html: renderEmailLayout({ previewText: `${d.purchaserName} bought "${d.title}"`, bodyHtml }),
    text: `Hi ${d.merchantName}, ${d.purchaserName} bought your gift card "${d.title}" from ${d.businessName} for ${d.amount}. The amount has been added to your wallet.`,
  };
}

/** To the person a gift card was bought for, when the buyer gave their email. */
export function giftCardReceivedEmail(d: {
  recipientName: string; senderName: string; code: string; value: string; businessName: string; businessId: string; expiresOn: string; message?: string | null;
}): RenderedEmail {
  const note = d.message
    ? `<p style="margin:0 0 20px 0; padding:12px 16px; border-left:3px solid #ED3131; background:#fafafa; font-size:15px; line-height:1.6; color:#3f3f46; font-style:italic;">${escapeHtml(d.message)}</p>`
    : "";
  const bodyHtml = `
<p ${EYEBROW}>You've got a gift</p>
<h1 ${H1}>${escapeHtml(d.senderName)} sent you a gift card</h1>
<p ${P}>Hi ${escapeHtml(d.recipientName)},</p>
<p ${P}>${escapeHtml(d.senderName)} bought you a gift card for <strong>${escapeHtml(d.businessName)}</strong>. Enter the code when you pay for a booking there.</p>
${note}
<table style="margin:0 0 24px 0; width:100%; border-collapse:collapse;" cellpadding="8" cellspacing="0">
  ${row("Code", d.code)}${row("Value", d.value)}${row("Salon", d.businessName)}${row("Valid until", d.expiresOn)}
</table>
${renderButton(`${CUSTOMER_APP_URL}/customer/salonListing/${d.businessId}`, "Book at " + d.businessName)}`;
  return {
    subject: `${d.senderName} sent you a gift card`,
    html: renderEmailLayout({ previewText: `A ${d.value} gift card for ${d.businessName}`, bodyHtml }),
    text: `Hi ${d.recipientName}, ${d.senderName} sent you a ${d.value} gift card for ${d.businessName}. Code: ${d.code}. Valid until ${d.expiresOn}.${d.message ? ` Message: ${d.message}` : ""}`,
  };
}
