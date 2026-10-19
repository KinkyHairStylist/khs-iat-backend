import prisma from "../../lib/prisma/prisma";
import { CURRENCY } from "../../config/env";
import { PENDING_HOLD_MINUTES } from "./bookingHolds";
import { parseDurationToMinutes } from "./bookingRulesCheck";
import { getPaymentSettings } from "./paymentSettings";
import { activeAppointments, loadVisibleOrder, orderTotalCents, type OrderAppointment } from "./orderStore";

// One of the customer's bookings, for the payment page and the booking details page.

const DEFAULT_CANCELLATION_WINDOW_HOURS = 24;

export type OrderStatus = "Pending" | "Confirmed" | "Rescheduled" | "Completed" | "Cancelled" | "No Show";

/** The order's state as one value, from its appointments' statuses. */
export function orderStatus(rows: OrderAppointment[]): OrderStatus {
  const active = activeAppointments(rows);
  if (active.length > 0) {
    if (active.some((r) => r.status === "Rescheduled")) return "Rescheduled";
    if (active.some((r) => r.status === "Confirmed")) return "Confirmed";
    return "Pending";
  }
  if (rows.some((r) => r.status === "Completed")) return "Completed";
  if (rows.some((r) => r.status === "No_Show")) return "No Show";
  return "Cancelled";
}

/** The salon's cancellation window: its booking policies, else its pricing settings, else 24 hours. */
export async function cancellationWindowHours(businessId: string): Promise<number> {
  const [policies, settings] = await Promise.all([
    prisma.booking_policies.findUnique({ where: { businessId }, select: { cancellationWindow: true } }),
    prisma.business_owner_settings.findUnique({ where: { businessId }, select: { pricingPoliciesCancellationwindow: true } }),
  ]);
  return policies?.cancellationWindow ?? settings?.pricingPoliciesCancellationwindow ?? DEFAULT_CANCELLATION_WINDOW_HOURS;
}

/** Whether the salon lets customers pay a 50% deposit (on unless it turned it off). */
export async function allowsDeposit(businessId: string): Promise<boolean> {
  const settings = await prisma.business_owner_settings.findUnique({ where: { businessId }, select: { pricingPoliciesAllowdepositpayment: true } });
  return settings?.pricingPoliciesAllowdepositpayment !== false;
}

const firstImage = (images: string[] | undefined) => images?.find((i) => i && !i.includes("placeholder") && !i.includes("generic")) ?? null;

export async function getCustomerBooking(userId: string, orderId: string) {
  const rows = await loadVisibleOrder(userId, orderId);
  const first = rows[0];
  const salon = first.businesses!;
  const stylist = first.appointment_staff[0]?.staff ?? null;
  const status = orderStatus(rows);
  const performance = (salon.performance ?? {}) as { rating?: number; reviews?: number };

  const [settings, windowHours, depositAllowed, review] = await Promise.all([
    getPaymentSettings(),
    cancellationWindowHours(salon.id),
    allowsDeposit(salon.id),
    prisma.reviews.findFirst({ where: { orderId }, select: { id: true } }),
  ]);

  return {
    orderId,
    status,
    paymentStatus: rows.every((r) => r.paymentStatus === "Paid") ? "Paid" : "Unpaid",
    /** Booked through this customer's account (so it can be paid for here), not by the salon. */
    ownBooking: first.client_id === userId,
    date: first.date,
    time: first.time,
    totalMinutes: rows.reduce((sum, r) => sum + parseDurationToMinutes(r.duration), 0),
    serviceTotal: orderTotalCents(rows) / 100,
    // While unpaid, the time is held this long from when it was picked.
    holdExpiresAt: status === "Pending" ? new Date(first.createdAt.getTime() + PENDING_HOLD_MINUTES * 60_000) : null,
    clientConfirmedAt: first.clientConfirmedAt,
    cancelledAt: rows.find((r) => r.cancelledAt)?.cancelledAt ?? null,
    hasReview: !!review,
    salon: {
      id: salon.id,
      businessName: salon.businessName,
      businessAddress: salon.businessAddress,
      businessImage: salon.businessImage,
      // The salon's contact details, for a customer with a booking there.
      phone: salon.ownerPhone,
      email: salon.ownerEmail,
      rating: Number(performance.rating ?? 0),
      reviews: Number(performance.reviews ?? 0),
      latitude: salon.latitude,
      longitude: salon.longitude,
    },
    stylist: stylist ? { id: stylist.id, name: `${stylist.firstName ?? ""} ${stylist.lastName ?? ""}`.trim() || null } : null,
    services: rows.map((r) => ({
      appointmentId: r.id, serviceId: r.service_id, name: r.serviceName, duration: r.duration, amount: r.amount,
      status: r.status === "No_Show" ? "No Show" : r.status, image: firstImage(r.Service?.images),
    })),
    payment: {
      currency: CURRENCY,
      allowDepositPayment: depositAllowed,
      cancellationWindowHours: windowHours,
      // Kept from a refund when cancelling before the window.
      earlyCancellationFee: settings.earlyCancellationFee,
      // What paying by card adds: rate % of what goes on the card, plus a fixed amount.
      processingFeeRate: settings.stripePassthroughRate,
      processingFeeFixed: settings.stripePassthroughFixedFee,
    },
  };
}
