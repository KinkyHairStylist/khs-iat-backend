import { CUSTOMER_APP_URL, SUPPORT_EMAIL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// The emails around a customer's account: welcome, sign-in alert, password
// changed, and the team's new-customer notice. Same wording as the
// Kinky-Hair-Stylist backend's EJS templates.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';
const NOTE = 'style="margin:0 0 32px 0; font-size:13px; line-height:1.6; color:#a1a1aa;"';
const CALLOUT_TD = 'style="background-color:#FEF2F2; border:1px solid #FBD5D5; border-radius:12px; padding:20px;"';

function utcTimestamp(at: Date): string {
  return at.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export function welcomeEmail({ name }: { name: string }): RenderedEmail {
  const bodyHtml = `
<h2 style="margin:0 0 8px; color:#B91C1C;">Welcome, ${escapeHtml(name)}!</h2>
<p ${P}>Your profile is all set. Start exploring top-rated stylists near you and book your next appointment in just a few taps.</p>
${renderButton(`${CUSTOMER_APP_URL}/customer/salonListing`, "Browse Stylists")}
<p style="margin:0 0 32px 0; font-size:14px; line-height:1.6; color:#71717a;">Need help? Visit our <a href="${escapeHtml(`${CUSTOMER_APP_URL}/customer/help`)}" style="color:#ED3131;">Help Center</a> anytime.</p>`;

  return {
    subject: "Welcome to Kinky Hairstylist!",
    html: renderEmailLayout({ previewText: "Your profile is all set", bodyHtml }),
    text: `Hi ${name}, welcome to Kinky Hairstylist! Your profile is all set. Start exploring stylists and book your next appointment today.`,
  };
}

export function loginAlertEmail({ name, at }: { name: string; at: Date }): RenderedEmail {
  const when = utcTimestamp(at);
  const support = escapeHtml(SUPPORT_EMAIL);
  const bodyHtml = `
<p ${EYEBROW}>Security alert</p>
<h1 ${H1}>New sign-in to your account</h1>
<p ${P}>Hi ${escapeHtml(name)},</p>
<p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#52525b;">We noticed a successful sign-in to your Kinky Hairstylist account at <strong>${when}</strong>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
  <tr><td ${CALLOUT_TD}>
    <p style="margin:0; font-size:14px; line-height:1.6; color:#52525b;">If this was you, no action is needed. If you don't recognise this sign-in, please reset your password and <a href="mailto:${support}" style="color:#ED3131;">contact support</a> immediately.</p>
  </td></tr>
</table>
<p ${NOTE}>This is an automated security notification &mdash; please don't reply directly to this email.</p>`;

  return {
    subject: "New sign-in to your Kinky Hairstylist account",
    html: renderEmailLayout({ previewText: "New sign-in to your account", bodyHtml }),
    text: `Hi ${name}, we noticed a successful sign-in to your Kinky Hairstylist account at ${when}. If this wasn't you, reset your password and contact ${SUPPORT_EMAIL}.`,
  };
}

export function passwordChangedEmail({ name, at }: { name: string; at: Date }): RenderedEmail {
  const when = utcTimestamp(at);
  const bodyHtml = `
<h2 style="margin:0 0 8px; color:#B91C1C;">Password Changed</h2>
<p ${P}>Hi ${escapeHtml(name)}, your password was successfully changed at ${when}. You've been signed out on your other devices.</p>
<p ${P}>If you did not make this change, please contact our support team immediately to secure your account.</p>
${renderButton(`${CUSTOMER_APP_URL}/customer/help`, "Contact Support")}`;

  return {
    subject: "Your Kinky Hairstylist password was changed",
    html: renderEmailLayout({ previewText: "Your password was changed", bodyHtml }),
    text: `Hi ${name}, your Kinky Hairstylist password was changed at ${when}. If this wasn't you, contact ${SUPPORT_EMAIL} immediately.`,
  };
}

export function newCustomerTeamEmail({ name, email, customerId }: { name: string; email: string; customerId: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>New Registration</p>
<h1 ${H1}>New customer signup</h1>
<p ${P}>A new customer has just created an account.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
  <tr><td ${CALLOUT_TD}>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="padding:4px 0; font-size:14px; color:#52525b;"><strong>Name:</strong> ${escapeHtml(name)}</td></tr>
      <tr><td style="padding:4px 0; font-size:14px; color:#52525b;"><strong>Email:</strong> ${escapeHtml(email)}</td></tr>
      <tr><td style="padding:4px 0; font-size:14px; color:#52525b;"><strong>Customer ID:</strong> ${escapeHtml(customerId)}</td></tr>
    </table>
  </td></tr>
</table>
<p ${NOTE}>This is an automatic notice for the Kinky Hairstylist team. No action is needed.</p>`;

  return {
    subject: `New customer signup: ${name}`,
    html: renderEmailLayout({ previewText: "A new customer signed up", bodyHtml }),
    text: `New customer signup: ${name} <${email}> (#${customerId}).`,
  };
}

/** `reward` is already formatted, e.g. "$20.00" (utils/money.ts). */
export function referralRewardEmail(input: { name: string; referredEmail: string; reward: string }): RenderedEmail {
  const { reward } = input;
  const bodyHtml = `
<p ${EYEBROW}>Referral reward</p>
<h1 ${H1}>You earned a referral reward!</h1>
<p ${P}>Hi ${escapeHtml(input.name)},</p>
<p style="margin:0 0 8px 0; font-size:15px; line-height:1.6; color:#52525b;">Great news — someone you referred has joined Kinky Hairstylist!</p>
<p style="margin:0 0 8px 0; font-size:15px; line-height:1.6; color:#52525b;">You've earned <strong>${escapeHtml(reward)}</strong> for referring <strong>${escapeHtml(input.referredEmail)}</strong>.</p>
<p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#52525b;">Your earnings are available in your account and can be withdrawn anytime.</p>
${renderButton(`${CUSTOMER_APP_URL}/customer/referral`, "View My Referrals")}
<p ${NOTE}>Keep sharing your referral link to earn more rewards!</p>`;

  return {
    subject: "You earned a referral reward!",
    html: renderEmailLayout({ previewText: `You earned ${reward}`, bodyHtml }),
    text: `Hi ${input.name}, you earned ${reward} for referring ${input.referredEmail} to Kinky Hairstylist!`,
  };
}

/** To the customer when an address is added to or changed on their account. */
export function addressChangedEmail(d: { name: string; addressType: string; fullAddress: string; action: "added" | "updated" }): RenderedEmail {
  const bodyHtml = `
<h2 style="margin:0 0 8px; color:#B91C1C;">Address ${d.action === "added" ? "Added" : "Updated"}</h2>
<p ${P}>Hi ${escapeHtml(d.name)}, your ${escapeHtml(d.addressType)} address has been ${d.action}:</p>
<p style="margin:0 0 20px 0; padding:12px 16px; background:#fafafa; border-radius:8px; font-size:15px; line-height:1.6; color:#3f3f46;">${escapeHtml(d.fullAddress)}</p>
<p ${P}>If this wasn't you, please contact our support team immediately.</p>
${renderButton(`${CUSTOMER_APP_URL}/customer/profile`, "View your profile")}`;
  return {
    subject: `Address ${d.action === "added" ? "Added" : "Updated"} – Kinky Hairstylist`,
    html: renderEmailLayout({ previewText: `Your ${d.addressType} address was ${d.action}`, bodyHtml }),
    text: `Hi ${d.name}, your ${d.addressType} address (${d.fullAddress}) has been ${d.action}. If this wasn't you, contact ${SUPPORT_EMAIL} immediately.`,
  };
}

/** To the customer once their account is closed. */
export function accountDeletedEmail({ name }: { name: string }): RenderedEmail {
  const bodyHtml = `
<h2 style="margin:0 0 8px; color:#B91C1C;">Your account has been deleted</h2>
<p ${P}>Hi ${escapeHtml(name)}, your Kinky Hairstylist account has been closed and your personal details removed. Records of past bookings and payments are kept, without your details, because salons need them for their own records.</p>
<p ${P}>If you didn't ask for this, please contact our support team straight away.</p>
<p ${NOTE}>You're welcome back any time: you can sign up again with the same email address.</p>`;
  return {
    subject: "Your Kinky Hairstylist account has been deleted",
    html: renderEmailLayout({ previewText: "Your account has been deleted", bodyHtml }),
    text: `Hi ${name}, your Kinky Hairstylist account has been closed and your personal details removed. If you didn't ask for this, contact ${SUPPORT_EMAIL} straight away.`,
  };
}

/** To the customer when they ask for a refund. */
export function refundRequestedEmail(d: { name: string; reference: string; amount: string; reason: string }): RenderedEmail {
  const bodyHtml = `
<h2 style="margin:0 0 8px; color:#B91C1C;">Refund request received</h2>
<p ${P}>Hi ${escapeHtml(d.name)}, we've received your refund request for <strong>${escapeHtml(d.amount)}</strong> (reference ${escapeHtml(d.reference)}).</p>
<p style="margin:0 0 20px 0; padding:12px 16px; background:#fafafa; border-radius:8px; font-size:15px; line-height:1.6; color:#3f3f46;">${escapeHtml(d.reason)}</p>
<p ${P}>Our team will review it within 3–5 business days. Approved card payments are refunded to the card you paid with.</p>
${renderButton(`${CUSTOMER_APP_URL}/customer/settings/billing-history`, "View billing history")}`;
  return {
    subject: "Refund request received – Kinky Hairstylist",
    html: renderEmailLayout({ previewText: `Refund request ${d.reference} received`, bodyHtml }),
    text: `Hi ${d.name}, your refund request (ref: ${d.reference}) for ${d.amount} has been received. Reason: ${d.reason}. Our team will review it within 3-5 business days.`,
  };
}

/** To the KHS team when a customer asks for a refund. */
export function refundRequestTeamEmail(d: { customer: string; email: string; reference: string; amount: string; description: string; reason: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Refund request</p>
<h1 ${H1}>A customer asked for a refund</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
  <tr><td ${CALLOUT_TD}>
    <p style="margin:0 0 6px; font-size:14px; color:#52525b;"><strong>Customer:</strong> ${escapeHtml(d.customer)} (${escapeHtml(d.email)})</p>
    <p style="margin:0 0 6px; font-size:14px; color:#52525b;"><strong>Payment:</strong> ${escapeHtml(d.description)}</p>
    <p style="margin:0 0 6px; font-size:14px; color:#52525b;"><strong>Amount:</strong> ${escapeHtml(d.amount)}</p>
    <p style="margin:0 0 6px; font-size:14px; color:#52525b;"><strong>Reference:</strong> ${escapeHtml(d.reference)}</p>
    <p style="margin:0; font-size:14px; color:#52525b;"><strong>Reason:</strong> ${escapeHtml(d.reason)}</p>
  </td></tr>
</table>
<p ${P}>Review it in the staff app under Payments, where the refund can be issued.</p>`;
  return {
    subject: `Refund request from ${d.customer}`,
    html: renderEmailLayout({ previewText: `Refund request for ${d.amount}`, bodyHtml }),
    text: `${d.customer} (${d.email}) asked for a refund of ${d.amount} for "${d.description}" (ref ${d.reference}). Reason: ${d.reason}`,
  };
}
