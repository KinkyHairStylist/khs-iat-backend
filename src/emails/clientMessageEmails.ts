import { CUSTOMER_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// Emails a salon sends its clients (the salon's own words, escaped), and the
// notice that the salon replied to a client's review.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b; white-space:pre-line;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';
const BOX = 'style="margin:0 0 24px 0; background-color:#FEF2F2; border:1px solid #FECACA; border-radius:12px; padding:16px; text-align:center;"';
const e = escapeHtml;

interface Base { clientName: string; businessName: string }

function build(d: Base, o: { eyebrow: string; heading: string; body: string; extraHtml?: string; closing?: string; subject: string; text: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>${e(o.eyebrow)}</p>
<h1 ${H1}>${e(o.heading)}</h1>
<p ${P}>Dear ${e(d.clientName)},</p>
<p ${P}>${e(o.body)}</p>
${o.extraHtml ?? ""}
<p ${P}>${e(o.closing ?? "Thank you")},<br/><strong>${e(d.businessName)}</strong></p>`;
  return { subject: o.subject, html: renderEmailLayout({ previewText: o.heading, bodyHtml }), text: `Dear ${d.clientName},\n\n${o.text}\n\n${o.closing ?? "Thank you"},\n${d.businessName}` };
}

export function salonMessageEmail(d: Base & { subject: string; message: string; closing?: string }): RenderedEmail {
  return build(d, { eyebrow: `Message from ${d.businessName}`, heading: d.subject, body: d.message, closing: d.closing, subject: d.subject, text: d.message });
}

export function salonReminderEmail(d: Base & { heading: string; message: string; when: string }): RenderedEmail {
  const extra = `<div ${BOX}><strong>${e(d.when)}</strong></div>`;
  return build(d, { eyebrow: "Reminder", heading: d.heading, body: d.message, extraHtml: extra, subject: `${d.heading} — ${d.businessName}`, text: `${d.message}\n\n${d.when}` });
}

export function salonPromotionEmail(d: Base & { title: string; offer: string; code: string; expires: string; description: string }): RenderedEmail {
  const extra = `<div ${BOX}><p style="margin:0 0 8px 0; font-size:24px; font-weight:700; color:#ED3131;">${e(d.offer)}</p>
<p style="margin:0; font-size:14px; color:#52525b;">Use code <strong>${e(d.code)}</strong> — ends ${e(d.expires)}</p></div>
${renderButton(`${CUSTOMER_APP_URL}/customer/salonListing`, "Book Now")}`;
  return build(d, {
    eyebrow: `Offer from ${d.businessName}`, heading: d.title, body: d.description, extraHtml: extra,
    subject: `${d.title} — ${d.businessName}`, text: `${d.description}\n\n${d.offer} — use code ${d.code}, ends ${d.expires}.`,
  });
}

export function reviewReplyEmail(d: Base & { comment: string; reply: string }): RenderedEmail {
  const extra = `<p ${P}><em>&ldquo;${e(d.comment)}&rdquo;</em></p><p ${P}><strong>Their reply:</strong><br/>${e(d.reply)}</p>`;
  return build(d, {
    eyebrow: "Review reply", heading: `${d.businessName} replied to your review`, body: "Thank you for your review. The salon has replied:",
    extraHtml: extra, subject: `${d.businessName} replied to your review`, text: `${d.businessName} replied to your review "${d.comment}":\n\n${d.reply}`,
  });
}
