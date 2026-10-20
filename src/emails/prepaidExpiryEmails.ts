import { CUSTOMER_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// To a customer whose membership sessions or gift card balance ran out of time.
// Same wording as the Kinky-Hair-Stylist backend's expiry email.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';

function expiredEmail(name: string, message: string, link: string, linkLabel: string): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Prepaid balance expired</p>
<h1 ${H1}>Your prepaid balance has expired</h1>
<p ${P}>Hi ${escapeHtml(name)},</p>
<p ${P}>${escapeHtml(message)}</p>
${renderButton(link, linkLabel)}`;
  return { subject: "Your prepaid balance has expired", html: renderEmailLayout({ previewText: message, bodyHtml }), text: `Hi ${name}, ${message}` };
}

export function membershipExpiredEmail(d: { name: string; sessions: number; packageName: string }): RenderedEmail {
  const message = `Your ${d.sessions} remaining session${d.sessions === 1 ? "" : "s"} on your "${d.packageName}" package have expired and are no longer redeemable.`;
  return expiredEmail(d.name, message, `${CUSTOMER_APP_URL}/customer/membership`, "View My Memberships");
}

export function giftCardExpiredEmail(d: { name: string; title: string; balance: string }): RenderedEmail {
  const message = `Your gift card "${d.title}" with a remaining balance of ${d.balance} has expired and is no longer redeemable.`;
  return expiredEmail(d.name, message, `${CUSTOMER_APP_URL}/customer/gift`, "View My Gift Cards");
}
