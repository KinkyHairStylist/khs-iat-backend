import prisma from "../../lib/prisma/prisma";
import { DELIVERY_TEAM_EMAIL } from "../../config/env";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { notifySlack } from "../../lib/slack";
import { bookingConfirmedEmail, merchantNewBookingEmail } from "../../emails";
import { formatMoney } from "../../utils/money";
import { getServiceLogger } from "../../utils/loggerCreator";
import { notifyUser } from "../notificationsService";
import { loadOrder, orderServiceNames } from "./orderStore";

const logger = getServiceLogger("booking-announcements");

export interface HowPaid {
  /** What was charged (card, or gift card for a gift-card booking). */
  amountCents: number;
  /** As the customer's receipt shows it, e.g. "Card (Stripe)". */
  method: string;
  /** For bookings not paid by card, e.g. "Paid with a gift card". */
  merchantNote?: string;
}

/**
 * Tells everyone a booking is confirmed: the customer (bell, and email unless
 * they turned booking emails off), the salon (bell and email, unless it turned
 * new-booking alerts off — KHS gets the email either way) and KHS on Slack.
 * Never throws: the booking is already confirmed.
 */
export async function announceConfirmedBooking(orderId: string, paid: HowPaid): Promise<void> {
  try {
    const rows = await loadOrder(orderId);
    const first = rows[0];
    if (!first?.client_id || !first.businesses) return;

    const salon = first.businesses;
    const [customer, emailPrefs, salonSettings, owner] = await Promise.all([
      prisma.user.findUnique({ where: { id: first.client_id }, select: { firstName: true, surname: true, email: true } }),
      prisma.user_notification_settings.findUnique({ where: { userId: first.client_id }, select: { emailBookingConfirmations: true } }),
      prisma.business_owner_settings.findUnique({ where: { businessId: salon.id }, select: { notificationsBusinessNotificationsNewbookingalerts: true } }),
      prisma.user.findUnique({ where: { id: salon.owner_id }, select: { email: true, firstName: true, surname: true } }),
    ]);
    if (!customer) return;

    const customerName = `${customer.firstName ?? ""} ${customer.surname ?? ""}`.trim() || "A customer";
    const details = { orderId, businessName: salon.businessName, serviceNames: orderServiceNames(rows), date: first.date, time: first.time };
    const amount = formatMoney(paid.amountCents / 100);

    notifyUser(first.client_id, {
      type: "BOOKING_CONFIRMED",
      title: "Booking Confirmed",
      message: `Your booking at ${salon.businessName} for ${details.serviceNames} on ${details.date} at ${details.time} is confirmed.`,
      link: "/customer/appointment/booking-management",
      metadata: { orderId, salonId: salon.id },
    });
    // No settings saved yet means the default: booking emails on.
    if (customer.email && emailPrefs?.emailBookingConfirmations !== false) {
      const email = bookingConfirmedEmail({ ...details, name: customer.firstName || "there", amountPaid: paid.amountCents > 0 ? amount : undefined, paymentMethod: paid.method });
      sendEmailInBackground({ to: customer.email, ...email, cc: DELIVERY_TEAM_EMAIL || undefined });
    }

    const salonAlerts = salonSettings?.notificationsBusinessNotificationsNewbookingalerts !== false;
    if (salonAlerts) {
      notifyUser(salon.owner_id, {
        type: "BOOKING_CONFIRMED",
        title: paid.merchantNote ? "New Booking Confirmed" : "New Booking & Payment Received",
        message: paid.merchantNote
          ? `A new booking has been placed by ${customerName} for ${details.serviceNames}.`
          : `Payment of ${amount} received for booking by ${customerName} (${details.serviceNames}).`,
        link: "/merchant/dashboard/bookings",
        metadata: { orderId, salonId: salon.id, customerId: first.client_id, amountPaid: paid.amountCents / 100 },
      });
    }
    const merchantEmail = salon.ownerEmail || owner?.email;
    const to = (salonAlerts && merchantEmail) || DELIVERY_TEAM_EMAIL;
    if (to) {
      const merchantName = salon.ownerName || `${owner?.firstName ?? ""} ${owner?.surname ?? ""}`.trim() || "Salon Owner";
      const email = merchantNewBookingEmail({ ...details, merchantName, customerName, amountPaid: amount, paymentNote: paid.merchantNote });
      sendEmailInBackground({ to, ...email, cc: DELIVERY_TEAM_EMAIL || undefined });
    }

    notifySlack({
      node: "Payment",
      trigger: `Booking ${orderId} confirmed`,
      body: `• Order ID: ${orderId}
        • Customer: ${customerName} (${customer.email ?? "no email"})
        • Salon: ${salon.businessName}
        • Services: ${details.serviceNames}
        • Appointment: ${details.date} at ${details.time}
        • Paid: ${paid.merchantNote ?? `${amount} by ${paid.method}`}`,
    });
  } catch (err) {
    logger.error("Could not announce a confirmed booking", { orderId, error: (err as Error).message });
  }
}
