import { CUSTOMER_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// To the customer when the salon acts on their booking: confirmed it,
// cancelled it, finished it, or marked them as not having turned up.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';
const e = escapeHtml;
const MY_BOOKINGS = `${CUSTOMER_APP_URL}/customer/appointment/booking-management`;

export interface SalonBookingChange {
  name: string;
  businessName: string;
  serviceNames: string;
  date: string;
  time: string;
}

function build(d: SalonBookingChange, o: { eyebrow: string; heading: string; body: string; extra?: string; button: [string, string]; subject: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>${e(o.eyebrow)}</p>
<h1 ${H1}>${e(o.heading)}</h1>
<p ${P}>Hi ${e(d.name)},</p>
<p ${P}>${o.body}</p>
${o.extra ? `<p ${P}>${e(o.extra)}</p>` : ""}
${renderButton(o.button[0], o.button[1])}`;
  const plain = o.body.replace(/<[^>]+>/g, "");
  return {
    subject: o.subject,
    html: renderEmailLayout({ previewText: o.heading, bodyHtml }),
    text: `Hi ${d.name}, ${plain}${o.extra ? ` ${o.extra}` : ""}`,
  };
}

const what = (d: SalonBookingChange) =>
  `your appointment at <strong>${e(d.businessName)}</strong> for <strong>${e(d.serviceNames)}</strong> on <strong>${e(d.date)}</strong> at <strong>${e(d.time)}</strong>`;

export function bookingAcceptedBySalonEmail(d: SalonBookingChange): RenderedEmail {
  return build(d, {
    eyebrow: "Booking confirmed", heading: "Your appointment is confirmed", subject: `Your appointment at ${d.businessName} is confirmed`,
    body: `Good news — ${what(d)} has been confirmed by the salon.`, button: [MY_BOOKINGS, "View My Bookings"],
  });
}

export function bookingCancelledBySalonEmail(d: SalonBookingChange & { reason?: string; moneyNote?: string }): RenderedEmail {
  return build(d, {
    eyebrow: "Appointment cancelled", heading: "The salon cancelled your appointment", subject: `${d.businessName} cancelled your appointment`,
    body: `We're sorry — ${what(d)} has been cancelled by the salon.${d.reason ? ` Reason given: ${e(d.reason)}` : ""}`,
    extra: d.moneyNote, button: [`${CUSTOMER_APP_URL}/customer/salonListing`, "Book Another Appointment"],
  });
}

export function bookingCompletedEmail(d: SalonBookingChange): RenderedEmail {
  return build(d, {
    eyebrow: "Appointment completed", heading: "Thanks for visiting", subject: `Your appointment at ${d.businessName} is complete`,
    body: `${what(d).replace(/^your/, "Your")} has been marked as completed. We hope you loved it — you can leave a review from your bookings.`,
    button: [MY_BOOKINGS, "Leave a Review"],
  });
}

export function bookingNoShowEmail(d: SalonBookingChange): RenderedEmail {
  return build(d, {
    eyebrow: "Missed appointment", heading: "You were marked as a no-show", subject: `Missed appointment at ${d.businessName}`,
    body: `The salon marked you as not attending ${what(d)}. If this is a mistake, please contact the salon or our support team.`,
    button: [MY_BOOKINGS, "View My Bookings"],
  });
}
