import prisma from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/centralAppError";

// An order is every appointment sharing one orderId (one per service booked).

const ORDER_SELECT = {
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
  cancelledAt: true,
  clientConfirmedAt: true,
  client_id: true,
  business_id: true,
  Service: { select: { images: true } },
  appointment_staff: { select: { staff: { select: { id: true, firstName: true, lastName: true } } } },
  businesses: {
    select: {
      id: true, businessName: true, businessAddress: true, businessImage: true, owner_id: true, ownerName: true, ownerEmail: true,
      ownerPhone: true, planTier: true, performance: true, latitude: true, longitude: true,
    },
  },
} satisfies Prisma.appointmentsSelect;

export type OrderAppointment = Prisma.appointmentsGetPayload<{ select: typeof ORDER_SELECT }>;

/**
 * The customer's own order. Someone else's order is reported as not found,
 * so its existence isn't given away.
 */
export async function loadCustomerOrder(userId: string, orderId: string, db: Prisma.TransactionClient = prisma): Promise<OrderAppointment[]> {
  const rows = await db.appointments.findMany({
    where: { orderId, client_id: userId },
    select: ORDER_SELECT,
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) throw AppError.notFound("Booking");
  return rows;
}

/** Any order by id (for confirming a payment Stripe reports, whoever is signed in). */
export async function loadOrder(orderId: string, db: Prisma.TransactionClient = prisma): Promise<OrderAppointment[]> {
  return db.appointments.findMany({ where: { orderId }, select: ORDER_SELECT, orderBy: { createdAt: "asc" } });
}

export const orderTotalCents = (rows: OrderAppointment[]) => rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0);
export const orderServiceNames = (rows: OrderAppointment[]) => [...new Set(rows.map((r) => r.serviceName))].join(", ");
export const isOrderConfirmed = (rows: OrderAppointment[]) => rows.some((r) => r.status === "Confirmed" || r.status === "Completed");

/**
 * Marks every appointment in the order paid and confirmed. A rebooked date
 * and time waiting on payment (pendingRebookDate/Time) becomes the real one now.
 */
export async function confirmOrder(db: Prisma.TransactionClient, orderId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE appointments SET
      status = 'Confirmed', "paymentStatus" = 'Paid', "updatedAt" = NOW(),
      date = CASE WHEN "pendingRebookDate" IS NOT NULL AND "pendingRebookTime" IS NOT NULL THEN "pendingRebookDate" ELSE date END,
      time = CASE WHEN "pendingRebookDate" IS NOT NULL AND "pendingRebookTime" IS NOT NULL THEN "pendingRebookTime" ELSE time END,
      "pendingRebookDate" = CASE WHEN "pendingRebookTime" IS NOT NULL THEN NULL ELSE "pendingRebookDate" END,
      "pendingRebookTime" = CASE WHEN "pendingRebookDate" IS NOT NULL THEN NULL ELSE "pendingRebookTime" END
    WHERE "orderId" = ${orderId} AND status <> 'Cancelled'`;
}

/**
 * Appointments the customer can see: booked through their account, or booked
 * for them by a salon under their email (a salon client record).
 */
export function visibleToCustomerSql(userId: string): Prisma.Sql {
  return Prisma.sql`(
    a.client_id = ${userId}::uuid
    OR a.business_client_id IN (
      SELECT c.id FROM clients c WHERE LOWER(c.email) = (SELECT LOWER(u.email) FROM "user" u WHERE u.id = ${userId}::uuid)
    )
  )`;
}

/** An order the customer can see (their own, or one a salon made for them). Not found otherwise. */
export async function loadVisibleOrder(userId: string, orderId: string, db: Prisma.TransactionClient = prisma): Promise<OrderAppointment[]> {
  const ids = await db.$queryRaw<Array<{ id: string }>>`
    SELECT a.id::text AS id FROM appointments a WHERE a."orderId" = ${orderId} AND ${visibleToCustomerSql(userId)}`;
  if (ids.length === 0) throw AppError.notFound("Booking");
  return db.appointments.findMany({ where: { id: { in: ids.map((r) => r.id) } }, select: ORDER_SELECT, orderBy: { createdAt: "asc" } });
}

/** Appointments still on the calendar (not cancelled, completed or a no-show). */
export const activeAppointments = (rows: OrderAppointment[]) => rows.filter((r) => r.status === "Pending" || r.status === "Confirmed" || r.status === "Rescheduled");
