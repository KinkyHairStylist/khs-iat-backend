import prisma from "../../lib/prisma/prisma";
import { DELIVERY_TEAM_EMAIL } from "../../config/env";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { notifySlack } from "../../lib/slack";
import { bookingCancelledEmail, bookingRescheduledEmail, merchantAvailabilityConfirmedEmail, merchantBookingCancelledEmail } from "../../emails";
import { getServiceLogger } from "../../utils/loggerCreator";
import { syncBookingCancelled, syncBookingRescheduled } from "../merchant/integrations/integrationSync";
import { notifyUser } from "../notificationsService";

const logger = getServiceLogger("booking-changes");

// Who is told about a change to a booking. Fire-and-forget: the change is done.

interface Change {
  orderId: string;
  customerId: string;
  businessId: string;
  serviceNames: string;
  date: string;
  time: string;
}

async function parties(change: Change) {
  const [customer, salon, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: change.customerId }, select: { email: true, firstName: true, surname: true } }),
    prisma.businesses.findUnique({ where: { id: change.businessId }, select: { businessName: true, owner_id: true, ownerName: true, ownerEmail: true } }),
    prisma.business_owner_settings.findUnique({ where: { businessId: change.businessId }, select: { notificationsBusinessNotificationsCancellationalerts: true } }),
  ]);
  const owner = salon ? await prisma.user.findUnique({ where: { id: salon.owner_id }, select: { email: true, firstName: true, surname: true } }) : null;
  return {
    customer,
    customerName: `${customer?.firstName ?? ""} ${customer?.surname ?? ""}`.trim() || "A client",
    salon,
    merchantName: salon?.ownerName || `${owner?.firstName ?? ""} ${owner?.surname ?? ""}`.trim() || "Salon Owner",
    merchantEmail: salon?.ownerEmail || owner?.email || null,
    cancellationAlerts: settings?.notificationsBusinessNotificationsCancellationalerts !== false,
  };
}

const run = (label: string, orderId: string, work: () => Promise<void>) =>
  void work().catch((err: Error) => logger.error(`Could not announce ${label}`, { orderId, error: err.message }));

/**
 * A cancellation. `salonWasTold` false (the booking was never confirmed —
 * e.g. checkout abandoned) means only the customer's bell hears of it.
 */
export function announceCancellation(change: Change, opts: { salonWasTold: boolean; customerMoneyNote?: string; merchantMoneyNote?: string }): void {
  syncBookingCancelled(change.orderId);
  run("a cancellation", change.orderId, async () => {
    const p = await parties(change);
    const businessName = p.salon?.businessName ?? "the salon";
    notifyUser(change.customerId, {
      type: "BOOKING_CANCELLED",
      title: "Booking Cancelled",
      message: `Your booking for ${change.serviceNames} has been cancelled.`,
      link: "/customer/appointment/booking-management",
      metadata: { orderId: change.orderId },
    });
    if (!opts.salonWasTold) return;

    if (p.customer?.email) {
      const email = bookingCancelledEmail({ ...change, businessName, name: p.customer.firstName || "Valued Customer", moneyNote: opts.customerMoneyNote });
      sendEmailInBackground({ to: p.customer.email, ...email, cc: DELIVERY_TEAM_EMAIL || undefined });
    }
    if (p.salon && p.cancellationAlerts) {
      notifyUser(p.salon.owner_id, {
        type: "BOOKING_CANCELLED",
        title: "Booking Cancelled",
        message: `${p.customerName} cancelled ${change.serviceNames} (${change.date} at ${change.time}).`,
        link: "/merchant/dashboard/bookings",
        metadata: { orderId: change.orderId, salonId: change.businessId, customerId: change.customerId },
      });
    }
    const to = (p.cancellationAlerts && p.merchantEmail) || DELIVERY_TEAM_EMAIL;
    if (to) {
      const email = merchantBookingCancelledEmail({ ...change, businessName, merchantName: p.merchantName, customerName: p.customerName, moneyNote: opts.merchantMoneyNote });
      sendEmailInBackground({ to, ...email, cc: DELIVERY_TEAM_EMAIL || undefined });
    }
    notifySlack({
      node: "Payment",
      trigger: `Booking ${change.orderId} cancelled`,
      body: `• Customer: ${p.customerName} (${p.customer?.email ?? "no email"})
        • Salon: ${businessName}
        • Services: ${change.serviceNames}
        • Was scheduled for: ${change.date} at ${change.time}
        ${opts.merchantMoneyNote ? `• Money: ${opts.merchantMoneyNote}` : ""}`,
    });
  });
}

/** A paid booking moved to a new time. */
export function announceReschedule(change: Change): void {
  syncBookingRescheduled(change.orderId);
  run("a reschedule", change.orderId, async () => {
    const p = await parties(change);
    if (!p.customer?.email) return;
    const email = bookingRescheduledEmail({ ...change, businessName: p.salon?.businessName ?? "the salon", name: p.customer.firstName || "Valued Customer" });
    sendEmailInBackground({ to: p.customer.email, ...email, cc: DELIVERY_TEAM_EMAIL || undefined });
  });
}

/** The customer confirmed they'll attend. */
export function announceAvailabilityConfirmed(change: Change): void {
  run("an availability confirmation", change.orderId, async () => {
    const p = await parties(change);
    if (!p.salon) return;
    notifyUser(p.salon.owner_id, {
      type: "SYSTEM",
      title: "Client Confirmed Availability",
      message: `${p.customerName} has confirmed their availability for appointment ${change.orderId} (${change.serviceNames}) on ${change.date} at ${change.time}.`,
      link: "/merchant/dashboard/bookings",
      metadata: { orderId: change.orderId, salonId: change.businessId, customerId: change.customerId },
    });
    if (p.merchantEmail) {
      const email = merchantAvailabilityConfirmedEmail({ ...change, businessName: p.salon.businessName, merchantName: p.merchantName, clientName: p.customerName });
      sendEmailInBackground({ to: p.merchantEmail, ...email, cc: DELIVERY_TEAM_EMAIL || undefined });
    }
  });
}
