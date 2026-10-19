import { MERCHANT_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// Emails around a merchant's account. Same wording as the Kinky-Hair-Stylist
// backend's merchant-welcome template.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';

/** To a new merchant, pointing at the business setup. */
export function merchantWelcomeEmail({ name }: { name: string }): RenderedEmail {
  const bodyHtml = `
<h2 style="margin:0 0 8px; color:#B91C1C;">Welcome to Kinky Hair Stylist, ${escapeHtml(name)}!</h2>
<p ${P}>Your merchant account is ready. Set up your business so customers can find you and book: add your details, services, opening hours and team.</p>
${renderButton(`${MERCHANT_APP_URL}/merchant/business-setup/step-1`, "Set up your business")}`;
  return {
    subject: "Welcome to Kinky Hair Stylist for business",
    html: renderEmailLayout({ previewText: "Your merchant account is ready", bodyHtml }),
    text: `Hi ${name}, your Kinky Hair Stylist merchant account is ready. Set up your business: ${MERCHANT_APP_URL}/merchant/business-setup/step-1`,
  };
}

/** To a merchant once their business is submitted: an admin reviews it before it's listed. */
export function merchantUnderReviewEmail({ businessName }: { businessName: string }): RenderedEmail {
  const bodyHtml = `
<h2 style="margin:0 0 8px; color:#B91C1C;">Your merchant profile is under review</h2>
<p ${P}>Hi ${escapeHtml(businessName)}, your merchant profile has been submitted and is now under review. Our team will review it within 24–48 hours and let you know once you're verified.</p>
<p ${P}>Meanwhile you can finish setting up: add your services, team and photos from your dashboard.</p>
${renderButton(`${MERCHANT_APP_URL}/merchant/dashboard`, "Go to your dashboard")}`;
  return {
    subject: "Your merchant profile is under review",
    html: renderEmailLayout({ previewText: "We're reviewing your business", bodyHtml }),
    text: `Hi ${businessName}, your merchant profile has been submitted and is now under review. Our team will review it within 24-48 hours and notify you once verified.`,
  };
}
