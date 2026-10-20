import { escapeHtml } from "../utils/escapeHtml";
import { renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// To a person a salon adds to (or removes from) its team. No sign-in details:
// team members don't have a login yet (the old email sent a password in plain text).

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';
const e = escapeHtml;

export function staffAddedEmail(d: { name: string; businessName: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Welcome to the team</p>
<h1 ${H1}>You've been added to ${e(d.businessName)}</h1>
<p ${P}>Hi ${e(d.name)},</p>
<p ${P}><strong>${e(d.businessName)}</strong> has added you to its team on Kinky Hair Stylists. Clients can now book you for the services the salon assigns to you.</p>
<p ${P}>If you weren't expecting this, please contact the salon.</p>`;
  return {
    subject: `You've been added to the team at ${d.businessName}`,
    html: renderEmailLayout({ previewText: `${d.businessName} added you to its team`, bodyHtml }),
    text: `Hi ${d.name}, ${d.businessName} has added you to its team on Kinky Hair Stylists. If you weren't expecting this, please contact the salon.`,
  };
}

export function staffRemovedEmail(d: { name: string; businessName: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Team update</p>
<h1 ${H1}>You're no longer on the team at ${e(d.businessName)}</h1>
<p ${P}>Hi ${e(d.name)},</p>
<p ${P}><strong>${e(d.businessName)}</strong> has removed you from its team, so clients can no longer book you there.</p>`;
  return {
    subject: `Your place on the team at ${d.businessName}`,
    html: renderEmailLayout({ previewText: `${d.businessName} updated its team`, bodyHtml }),
    text: `Hi ${d.name}, ${d.businessName} has removed you from its team, so clients can no longer book you there.`,
  };
}
