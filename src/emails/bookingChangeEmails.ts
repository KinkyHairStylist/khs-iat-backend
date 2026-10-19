import { CUSTOMER_APP_URL, MERCHANT_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// Changes to a booking: cancelled, rescheduled, attendance confirmed. Same
// wording as the Kinky-Hair-Stylist backend's cancellation-confirmation,
// reschedule-confirmation, merchant-cancellation-notification and
// client-confirmed-availability templates.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';
const LABEL = 'style="padding:6px 0; font-size:14px; color:#6B7280;"';
const VALUE = 'style="padding:6px 0; font-size:14px; font-weight:600; color:#111827;"';
const e = escapeHtml;

const details = (rows: Array<[string, string]>) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0; background-color:#F9FAFB; border:1px solid #E5E7EB; border-radius:12px; padding:16px;">
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${rows.map(([l, v]) => `<tr><td ${LABEL}>${e(l)}</td><td align="right" ${VALUE}>${e(v)}</td></tr>`).join("")}
  </table></td></tr>
</table>`;

export interface ChangedBooking {
  businessName: string;
  serviceNames: string;
  date: string;
  time: string;
}

/** To the customer: their appointment was cancelled, and what happened to their money. */
export function bookingCancelledEmail(d: ChangedBooking & { name: string; moneyNote?: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Appointment cancelled</p>
<h1 ${H1}>Your appointment has been cancelled</h1>
<p ${P}>Hi ${e(d.name)},</p>
<p ${P}>Your appointment at <strong>${e(d.businessName)}</strong> for <strong>${e(d.serviceNames)}</strong> on <strong>${e(d.date)}</strong> at <strong>${e(d.time)}</strong> has been cancelled as requested.</p>
${d.moneyNote ? `<p ${P}>${e(d.moneyNote)}</p>` : ""}
${renderButton(`${CUSTOMER_APP_URL}/customer/salonListing`, "Book a New Appointment")}
<p style="margin:0 0 4px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">If you'd like to rebook, simply visit our website. We'd love to have you back!</p>`;
  return {
    subject: "Your appointment has been cancelled",
    html: renderEmailLayout({ previewText: `Your appointment at ${d.businessName} was cancelled`, bodyHtml }),
    text: `Hi ${d.name}, your appointment at ${d.businessName} for ${d.serviceNames} on ${d.date} at ${d.time} has been cancelled.${d.moneyNote ? ` ${d.moneyNote}` : ""}`,
  };
}

/** To the customer: their appointment moved. */
export function bookingRescheduledEmail(d: ChangedBooking & { name: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Appointment rescheduled</p>
<h1 ${H1}>Your appointment has been rescheduled</h1>
<p ${P}>Hi ${e(d.name)},</p>
<p ${P}>Your appointment at <strong>${e(d.businessName)}</strong> for <strong>${e(d.serviceNames)}</strong> has been rescheduled.</p>
${details([["New Date:", d.date], ["New Time:", d.time], ["Service:", d.serviceNames], ["Business:", d.businessName]])}
${renderButton(`${CUSTOMER_APP_URL}/customer/appointment/booking-management`, "View My Bookings")}
<p style="margin:0 0 4px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">No further action is needed. We look forward to seeing you!</p>`;
  return {
    subject: "Your appointment has been rescheduled",
    html: renderEmailLayout({ previewText: `New time: ${d.date} at ${d.time}`, bodyHtml }),
    text: `Hi ${d.name}, your appointment at ${d.businessName} for ${d.serviceNames} has been rescheduled to ${d.date} at ${d.time}.`,
  };
}

/** To the salon: a client cancelled. */
export function merchantBookingCancelledEmail(d: ChangedBooking & { merchantName: string; customerName: string; orderId: string; moneyNote?: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Booking cancelled</p>
<h1 ${H1}>A client cancelled an appointment</h1>
<p ${P}>Hi ${e(d.merchantName)},</p>
<p ${P}><strong>${e(d.customerName)}</strong> has cancelled an appointment at <strong>${e(d.businessName)}</strong>. The time slot is free again.</p>
${details([["Order ID:", d.orderId], ["Service(s):", d.serviceNames], ["Was scheduled for:", `${d.date} at ${d.time}`], ["Customer:", d.customerName]])}
${d.moneyNote ? `<p ${P}>${e(d.moneyNote)}</p>` : ""}
${renderButton(`${MERCHANT_APP_URL}/merchant/dashboard/bookings`, "View in Merchant Dashboard")}`;
  return {
    subject: `Booking Cancelled – Order #${d.orderId}`,
    html: renderEmailLayout({ previewText: `${d.customerName} cancelled ${d.serviceNames}`, bodyHtml }),
    text: `Hi ${d.merchantName}, ${d.customerName} has cancelled ${d.serviceNames} on ${d.date} at ${d.time} (Order #${d.orderId}) at ${d.businessName}.${d.moneyNote ? ` ${d.moneyNote}` : ""}`,
  };
}

/** To the salon: the client confirmed they'll attend. */
export function merchantAvailabilityConfirmedEmail(d: ChangedBooking & { merchantName: string; clientName: string; orderId: string }): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Client Availability Confirmed</p>
<h1 ${H1}>Client has confirmed their appointment attendance</h1>
<p ${P}>Hi ${e(d.merchantName)},</p>
<p ${P}>Great news! <strong>${e(d.clientName)}</strong> has confirmed that they will be attending their upcoming appointment at <strong>${e(d.businessName)}</strong>.</p>
${details([["Order Reference:", d.orderId], ["Client:", d.clientName], ["Service:", d.serviceNames], ["Date:", d.date], ["Time:", d.time]])}
${renderButton(`${MERCHANT_APP_URL}/merchant/dashboard/bookings`, "View in Bookings")}
<p style="margin:0 0 4px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">Manage this and other upcoming bookings from your merchant dashboard.</p>`;
  return {
    subject: `Client Confirmed Availability: Appointment ${d.orderId}`,
    html: renderEmailLayout({ previewText: `${d.clientName} will attend on ${d.date}`, bodyHtml }),
    text: `Hi ${d.merchantName}, ${d.clientName} has confirmed their availability to attend their appointment (${d.orderId}) at ${d.businessName} for ${d.serviceNames} on ${d.date} at ${d.time}.`,
  };
}
