import { CUSTOMER_APP_URL, MERCHANT_APP_URL } from "../config/env";
import { escapeHtml } from "../utils/escapeHtml";
import { renderButton, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./types";

// Booking confirmed — to the customer, and to the salon. Same wording and
// layout as the Kinky-Hair-Stylist backend's booking-confirmation and
// merchant-booking-notification templates.

const P = 'style="margin:0 0 16px 0; font-size:15px; line-height:1.6; color:#52525b;"';
const EYEBROW = 'style="margin:0 0 4px 0; font-size:13px; font-weight:600; letter-spacing:0.5px; text-transform:uppercase; color:#ED3131;"';
const H1 = 'style="margin:0 0 16px 0; font-size:22px; font-weight:700; color:#18181b; line-height:1.3;"';
const LABEL = 'style="padding:6px 0; font-size:14px; color:#6B7280;"';
const VALUE = 'style="padding:6px 0; font-size:14px; font-weight:600; color:#111827;"';
const TOTAL_LABEL = 'style="padding:8px 0 0 0; font-size:15px; font-weight:700; color:#111827;"';
const TOTAL_VALUE = 'style="padding:8px 0 0 0; font-size:16px; font-weight:700; color:#ED3131;"';

const row = (label: string, value: string) =>
  `<tr><td ${LABEL}>${escapeHtml(label)}</td><td align="right" ${VALUE}>${escapeHtml(value)}</td></tr>`;
const totalRow = (label: string, value: string) =>
  `<tr style="border-top:1px solid #E5E7EB;"><td ${TOTAL_LABEL}>${escapeHtml(label)}</td><td align="right" ${TOTAL_VALUE}>${escapeHtml(value)}</td></tr>`;
const detailsTable = (rows: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0; background-color:#F9FAFB; border:1px solid #E5E7EB; border-radius:12px; padding:16px;">
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
</table>`;

export interface BookingEmailDetails {
  orderId: string;
  businessName: string;
  serviceNames: string;
  date: string;
  time: string;
}

/** To the customer once their booking is paid (or confirmed without payment). */
export function bookingConfirmedEmail(
  d: BookingEmailDetails & { name: string; amountPaid?: string; paymentMethod: string },
): RenderedEmail {
  const bodyHtml = `
<p ${EYEBROW}>Payment &amp; Appointment Confirmed</p>
<h1 ${H1}>Your booking payment is confirmed</h1>
<p ${P}>Hi ${escapeHtml(d.name)},</p>
<p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#52525b;">Thank you for your payment! Your appointment at <strong>${escapeHtml(d.businessName)}</strong> for <strong>${escapeHtml(d.serviceNames)}</strong> on <strong>${escapeHtml(d.date)}</strong> at <strong>${escapeHtml(d.time)}</strong> has been confirmed.</p>
${d.amountPaid ? detailsTable(row("Order ID:", d.orderId) + row("Payment Method:", d.paymentMethod) + row("Payment Status:", "PAID") + totalRow("Total Paid:", d.amountPaid)) : ""}
${renderButton(`${CUSTOMER_APP_URL}/customer/appointment/booking-management`, "View My Bookings")}
<p style="margin:0 0 4px 0; font-size:13px; line-height:1.6; color:#a1a1aa;">Need to reschedule or cancel? Visit your bookings page.</p>`;

  return {
    subject: `Payment & Appointment Confirmed – ${d.businessName}`,
    html: renderEmailLayout({ previewText: `Your appointment at ${d.businessName} is confirmed`, bodyHtml }),
    text: `Hi ${d.name}, your payment of ${d.amountPaid ?? "the full amount"} for your appointment at ${d.businessName} for ${d.serviceNames} on ${d.date} at ${d.time} (Order #${d.orderId}) has been confirmed.`,
  };
}

/**
 * To the salon about a new confirmed booking. `paymentNote` (e.g. "Paid with a
 * gift card") replaces the "Amount Paid" line for bookings not paid by card.
 */
export function merchantNewBookingEmail(
  d: BookingEmailDetails & { merchantName: string; customerName: string; amountPaid: string; paymentNote?: string },
): RenderedEmail {
  const byCard = !d.paymentNote;
  const bodyHtml = `
<p ${EYEBROW}>${byCard ? "New Paid Booking" : "New Booking"}</p>
<h1 ${H1}>${byCard ? "New appointment booking &amp; payment received" : "New appointment booking"}</h1>
<p ${P}>Hi ${escapeHtml(d.merchantName)},</p>
<p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#52525b;">You have a new confirmed appointment booking from <strong>${escapeHtml(d.customerName)}</strong> at <strong>${escapeHtml(d.businessName)}</strong>.</p>
${detailsTable(
  row("Order ID:", d.orderId) +
    row("Service(s):", d.serviceNames) +
    row("Date & Time:", `${d.date} at ${d.time}`) +
    row("Customer:", d.customerName) +
    (byCard ? totalRow("Amount Paid:", d.amountPaid) : totalRow("Payment:", d.paymentNote!)),
)}
${renderButton(`${MERCHANT_APP_URL}/merchant/dashboard/bookings`, "View in Merchant Dashboard")}`;

  return {
    subject: byCard ? `New Booking & Payment Received (${d.amountPaid}) – Order #${d.orderId}` : `New Booking Confirmed – Order #${d.orderId}`,
    html: renderEmailLayout({ previewText: `New booking from ${d.customerName}`, bodyHtml }),
    text: byCard
      ? `Hi ${d.merchantName}, ${d.customerName} has booked and paid ${d.amountPaid} for ${d.serviceNames} on ${d.date} at ${d.time} (Order #${d.orderId}) at ${d.businessName}.`
      : `Hi ${d.merchantName}, ${d.customerName} has booked ${d.serviceNames} on ${d.date} at ${d.time} (Order #${d.orderId}) at ${d.businessName}. ${d.paymentNote}.`,
  };
}
