import prisma from "../../../lib/prisma/prisma";
import { DELIVERY_TEAM_EMAIL } from "../../../config/env";
import { sendEmailInBackground } from "../../../lib/emailEngine/sendgrid";
import {
  bookingAcceptedBySalonEmail, bookingCancelledBySalonEmail, bookingCompletedEmail, bookingNoShowEmail, bookingRescheduledEmail,
} from "../../../emails";
import type { RenderedEmail } from "../../../emails";
import { getServiceLogger } from "../../../utils/loggerCreator";
import { notifyUser, type NotificationType } from "../../notificationsService";

const logger = getServiceLogger("salon-booking-changes");

// Telling the client when the salon changes their booking. A customer with an
// account gets a bell notification and an email; a salon client record (no
// account) gets the email. Fire-and-forget: the change is already saved.

export interface SalonChange {
  orderId: string | null;
  businessId: string;
  businessName: string;
  customerId: string | null;
  businessClientId: string | null;
  ownerId: string;
  serviceNames: string;
  date: string;
  time: string;
}

export type SalonChangeKind =
  | { kind: "accepted" }
  | { kind: "cancelled"; reason?: string; moneyNote?: string }
  | { kind: "completed" }
  | { kind: "no-show" }
  | { kind: "rescheduled" };

const BELL: Record<SalonChangeKind["kind"], { type: NotificationType; title: string; message: (c: SalonChange) => string }> = {
  accepted: { type: "BOOKING_CONFIRMED", title: "Booking Accepted", message: (c) => `Your booking at ${c.businessName} for ${c.serviceNames} has been accepted.` },
  cancelled: { type: "BOOKING_CANCELLED", title: "Booking Cancelled by the Salon", message: (c) => `${c.businessName} cancelled your booking for ${c.serviceNames} on ${c.date} at ${c.time}.` },
  completed: { type: "SYSTEM", title: "Appointment Completed", message: (c) => `Your appointment at ${c.businessName} for ${c.serviceNames} has been completed.` },
  "no-show": { type: "SYSTEM", title: "Marked as No-Show", message: (c) => `You were marked as a no-show for your appointment at ${c.businessName} for ${c.serviceNames}.` },
  rescheduled: { type: "SYSTEM", title: "Appointment Rescheduled", message: (c) => `${c.businessName} moved your appointment for ${c.serviceNames} to ${c.date} at ${c.time}.` },
};

async function recipient(c: SalonChange): Promise<{ email: string; name: string } | null> {
  if (c.customerId) {
    const u = await prisma.user.findUnique({ where: { id: c.customerId }, select: { email: true, firstName: true } });
    return u?.email ? { email: u.email, name: u.firstName || "Valued Customer" } : null;
  }
  if (c.businessClientId) {
    const r = await prisma.clients.findFirst({ where: { id: c.businessClientId, owner_id: c.ownerId }, select: { email: true, firstName: true } });
    return r?.email ? { email: r.email, name: r.firstName || "Valued Customer" } : null;
  }
  return null;
}

function emailFor(change: SalonChangeKind, d: { name: string; businessName: string; serviceNames: string; date: string; time: string }): RenderedEmail {
  switch (change.kind) {
    case "accepted": return bookingAcceptedBySalonEmail(d);
    case "cancelled": return bookingCancelledBySalonEmail({ ...d, reason: change.reason, moneyNote: change.moneyNote });
    case "completed": return bookingCompletedEmail(d);
    case "no-show": return bookingNoShowEmail(d);
    case "rescheduled": return bookingRescheduledEmail(d);
  }
}

export function announceSalonChange(c: SalonChange, change: SalonChangeKind): void {
  void (async () => {
    if (c.customerId) {
      const bell = BELL[change.kind];
      notifyUser(c.customerId, {
        type: bell.type, title: bell.title, message: bell.message(c), link: "/customer/appointment/booking-management",
        metadata: { orderId: c.orderId, salonId: c.businessId, salonName: c.businessName },
      });
    }
    const to = await recipient(c);
    if (to) {
      const email = emailFor(change, { name: to.name, businessName: c.businessName, serviceNames: c.serviceNames, date: c.date, time: c.time });
      sendEmailInBackground({ to: to.email, ...email, cc: change.kind === "cancelled" ? DELIVERY_TEAM_EMAIL || undefined : undefined });
    }
  })().catch((err: Error) => logger.error(`Could not announce a salon ${change.kind}`, { orderId: c.orderId, error: err.message }));
}
