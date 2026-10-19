import { CUSTOMER_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";

const BRAND_NAME = "Kinky Hairstylist";
const BRAND_COLOR = "#ED3131";
const LOGO_URL =
  "https://firebasestorage.googleapis.com/v0/b/cvtocareer-394713.appspot.com/o/logo.png?alt=media&token=21e63b9f-cc30-420a-9592-6048701b1836";
const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface EmailLayoutInput {
  /** Shown as the inbox preview snippet; never rendered visibly in the body. */
  previewText: string;
  /** Pre-rendered inner HTML — must already be email-safe (inline styles, no external CSS). */
  bodyHtml: string;
}

/**
 * Shared table-based wrapper for all customer emails — same look as the
 * Kinky-Hair-Stylist backend's EJS layout (logo header, brand rule, footer).
 * Table layout + inline styles because Outlook/older clients strip
 * <div>-based CSS layouts and <style> blocks.
 */
export function renderEmailLayout({ previewText, bodyHtml }: EmailLayoutInput): string {
  const year = new Date().getFullYear();
  const siteUrl = escapeHtml(CUSTOMER_APP_URL);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${BRAND_NAME}</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f5;">
<div style="display:none; max-height:0; max-width:0; overflow:hidden; opacity:0; mso-hide:all;">${escapeHtml(previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:40px 0;">
<tr>
<td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #ececec;">
  <tr>
    <td style="padding:32px 40px 24px 40px; text-align:center; border-bottom:1px solid #f1f1f1;">
      <img src="${LOGO_URL}" width="108" height="39" alt="${BRAND_NAME}" style="display:inline-block;" />
    </td>
  </tr>
  <tr>
    <td style="height:4px; background-color:${BRAND_COLOR}; line-height:4px; font-size:0;">&nbsp;</td>
  </tr>
  <tr>
    <td style="padding:40px 40px 8px 40px; font-family:${FONT_STACK};">
      ${bodyHtml}
    </td>
  </tr>
  <tr><td style="padding:0 40px;"><hr style="border:none; border-top:1px solid #f1f1f1; margin:0;" /></td></tr>
  <tr>
    <td style="padding:24px 40px 32px 40px; font-family:${FONT_STACK}; text-align:center;">
      <p style="margin:0 0 6px 0; font-size:13px; color:#a1a1aa;">${BRAND_NAME} &mdash; find and book the perfect stylist.</p>
      <p style="margin:0 0 16px 0; font-size:13px;"><a href="${siteUrl}" style="color:${BRAND_COLOR}; text-decoration:none;">${siteUrl}</a></p>
      <p style="margin:0; font-size:12px; color:#d4d4d8;">&copy; ${year} ${BRAND_NAME}. All rights reserved.</p>
      <p style="margin:6px 0 0 0; font-size:12px; color:#d4d4d8;">This is an automated message, please don't reply directly to this email.</p>
    </td>
  </tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

/** Red pill call-to-action button, matching the KHS templates. */
export function renderButton(href: string, label: string): string {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background-color:${BRAND_COLOR}; border-radius:999px;">
            <a href="${escapeHtml(href)}" style="display:inline-block; padding:14px 36px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none;">${escapeHtml(label)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
