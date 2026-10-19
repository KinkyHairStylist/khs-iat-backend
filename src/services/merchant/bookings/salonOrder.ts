import prisma from "../../../lib/prisma/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { AppError } from "../../../middlewares/centralAppError";

// A booking as the salon acts on it. The calendar opens one appointment, but
// a customer's booking can hold several services under one order id, paid for
// as one — so changes (complete, no-show, cancel, reschedule) apply to the
// whole order, and the money is settled once.

const SALON_ORDER_SELECT = {
  id: true,
  orderId: true,
  serviceName: true,
  service_id: true,
  date: true,
  time: true,
  duration: true,
  amount: true,
  status: true,
  paymentStatus: true,
  createdAt: true,
  client_id: true,
  business_client_id: true,
  business_id: true,
  specialRequests: true,
  cancellationsNote: true,
  timeline: true,
  appointment_staff: { select: { staff: { select: { id: true, firstName: true, lastName: true, avatar: true, commissionRate: true } } } },
} satisfies Prisma.appointmentsSelect;

export type SalonAppointment = Prisma.appointmentsGetPayload<{ select: typeof SALON_ORDER_SELECT }>;

export interface SalonOrder {
  /** The appointment that was opened. */
  opened: SalonAppointment;
  /** Every appointment in its order (just the one when it has no order id). */
  rows: SalonAppointment[];
  orderId: string | null;
}

/** The salon's booking with its whole order. Another salon's booking is reported as not found. */
export async function loadSalonOrder(businessId: string, appointmentId: string, db: Prisma.TransactionClient = prisma): Promise<SalonOrder> {
  const opened = await db.appointments.findFirst({ where: { id: appointmentId, business_id: businessId }, select: SALON_ORDER_SELECT });
  if (!opened) throw AppError.notFound("Booking");
  const rows = opened.orderId
    ? await db.appointments.findMany({ where: { orderId: opened.orderId, business_id: businessId }, select: SALON_ORDER_SELECT, orderBy: { createdAt: "asc" } })
    : [opened];
  return { opened, rows, orderId: opened.orderId };
}

/** Appointments still on the calendar. */
export const STILL_BOOKED = ["Pending", "Confirmed", "Rescheduled"] as const;
export const isStillBooked = (r: SalonAppointment) => (STILL_BOOKED as readonly string[]).includes(r.status);

export const serviceNamesOf = (rows: SalonAppointment[]) => [...new Set(rows.map((r) => r.serviceName))].join(", ");
export const fullName = (first?: string | null, last?: string | null) => `${first ?? ""} ${last ?? ""}`.trim();

/** Locks the order for a change, so two people acting on it at once can't both apply. */
export async function lockOrder(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order:${key}`}))`;
}

/** The order's lock key: its order id, or the appointment's own id when it has none. */
export const orderKey = (order: SalonOrder) => order.orderId ?? order.opened.id;
