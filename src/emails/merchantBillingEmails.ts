import { MERCHANT_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// To a salon owner about their KHS plan: trial ending, a failed payment, and
// the storefront being suspended. Same wording as the Kinky-Hair-Stylist
// backend's emails, except the lapse reason, which it showed as a raw code.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';
const e = escapeHtml;
const BILLING = `${MERCHANT_APP_URL}/merchant/dashboard/billing`;

const longDate = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

export function trialEndingSoonEmail(d: { businessName: string; daysLeft: number; trialEndsAt: Date }): RenderedEmail {
  const days = `${d.daysLeft} ${d.daysLeft === 1 ? "day" : "days"}`;
  const ends = longDate(d.trialEndsAt);
  const bodyHtml = `
<p ${EYEBROW}>Free trial ending</p>
<h1 ${H1}>Your free trial ends in ${days}</h1>
<p ${P}>Hi ${e(d.businessName)},</p>
<p ${P}>Your free trial on Kinky Hairstylist ends on <strong>${ends}</strong>. Choose a plan and add a payment method before then to keep your storefront live.</p>
${renderButton(BILLING, "Choose a plan")}`;
  return {
    subject: `Your free trial ends in ${days}`,
    html: renderEmailLayout({ previewText: `Your free trial ends on ${ends}`, bodyHtml }),
    text: `Hi ${d.businessName}, your free trial on Kinky Hairstylist ends in ${days} (${ends}). Add a payment method before then to avoid your storefront being suspended: ${BILLING}`,
  };
}

export function planPaymentFailedEmail(d: { businessName: string; ownerName: string; graceDays: number }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Payment failed</p>
<h1 ${H1}>We couldn't take your KHS plan payment</h1>
<p ${P}>Hi ${e(d.ownerName)},</p>
<p ${P}>We couldn't process your latest KHS subscription payment for ${e(d.businessName)}. You have ${d.graceDays} days to update your card before your storefront is suspended.</p>
${renderButton(BILLING, "Update your card")}`;
  return {
    subject: "Your KHS billing payment failed",
    html: renderEmailLayout({ previewText: `Update your card within ${d.graceDays} days to keep your storefront live`, bodyHtml }),
    text: `Hi ${d.ownerName}, we couldn't process your latest KHS subscription payment for ${d.businessName}. You have ${d.graceDays} days to update your payment method before your storefront is suspended: ${BILLING}`,
  };
}

const LAPSE_REASONS: Record<string, string> = {
  trial_expired_no_payment_method: "your free trial ended without a payment method on file",
  payment_failed_grace_period_exceeded: "your plan payment failed and wasn't fixed in time",
  stripe_canceled: "your plan subscription was cancelled",
};

export function planLapsedEmail(d: { businessName: string; reason: string }): RenderedEmail {
  const why = LAPSE_REASONS[d.reason] ?? "your plan is no longer active";
  const bodyHtml = `
<p ${EYEBROW}>Storefront suspended</p>
<h1 ${H1}>Your merchant subscription has lapsed</h1>
<p ${P}>Hi ${e(d.businessName)},</p>
<p ${P}>Your storefront has been temporarily suspended because ${why}. Choose a plan and add a payment method to reactivate it straight away.</p>
${renderButton(BILLING, "Reactivate your storefront")}`;
  return {
    subject: "Your merchant subscription has lapsed",
    html: renderEmailLayout({ previewText: "Add a payment method to reactivate your storefront", bodyHtml }),
    text: `Hi ${d.businessName}, your storefront has been temporarily suspended because ${why}. Add or update your payment method to reactivate: ${BILLING}`,
  };
}
