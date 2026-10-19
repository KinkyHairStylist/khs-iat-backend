import prisma from "../../lib/prisma/prisma";
import { holdCutoff } from "./bookingHolds";
import { visibleToCustomerSql } from "./orderStore";

// "My appointments": every appointment the customer can see, one row per
// service booked (as the Kinky-Hair-Stylist page lists them).

interface MyAppointmentRow {
  appointmentId: string;
  orderId: string;
  businessId: string | null;
  serviceId: string | null;
  serviceName: string;
  date: string;
  time: string;
  duration: string;
  amount: number;
  status: string;
  paymentStatus: string;
  cancelledAt: Date | null;
  createdAt: Date;
  /** Booked through their account (so they can pay for it here), not by the salon. */
  ownBooking: boolean;
  salonName: string | null;
  salonAddress: string | null;
  salonImage: unknown;
  stylistFirstName: string | null;
  stylistLastName: string | null;
  hasReview: boolean;
}

/**
 * A booking held for payment that was never paid stops holding its time after
 * a while; it's marked cancelled when the customer next looks, rather than by
 * a background job (as the Kinky-Hair-Stylist backend does).
 */
async function expireUnpaidHolds(userId: string): Promise<void> {
  await prisma.appointments.updateMany({
    where: { client_id: userId, status: "Pending", paymentStatus: "Unpaid", createdAt: { lt: holdCutoff() } },
    data: { status: "Cancelled", cancellationsNote: "Payment not completed in time — booking expired", cancelledAt: new Date(), updatedAt: new Date() },
  });
}

export async function listMyAppointments(userId: string) {
  await expireUnpaidHolds(userId);
  const rows = await prisma.$queryRaw<MyAppointmentRow[]>`
    SELECT a.id::text AS "appointmentId", a."orderId", a.business_id::text AS "businessId", a.service_id::text AS "serviceId",
           a."serviceName", a.date, a.time, a.duration, a.amount, a.status::text AS status, a."paymentStatus"::text AS "paymentStatus",
           a."cancelledAt", a."createdAt", (a.client_id = ${userId}::uuid) AS "ownBooking",
           b."businessName" AS "salonName", b."businessAddress" AS "salonAddress", b."businessImage" AS "salonImage",
           st."firstName" AS "stylistFirstName", st."lastName" AS "stylistLastName",
           EXISTS (SELECT 1 FROM reviews r WHERE r."orderId" = a."orderId") AS "hasReview"
    FROM appointments a
    LEFT JOIN businesses b ON b.id = a.business_id
    LEFT JOIN LATERAL (
      SELECT s."firstName", s."lastName" FROM appointment_staff ast JOIN staff s ON s.id = ast.staff_id
      WHERE ast.appointment_id = a.id LIMIT 1
    ) st ON TRUE
    WHERE ${visibleToCustomerSql(userId)}
    ORDER BY a.date DESC, a."createdAt" DESC
    LIMIT 500`;

  return rows.map(({ stylistFirstName, stylistLastName, ...row }) => ({
    ...row,
    stylistName: `${stylistFirstName ?? ""} ${stylistLastName ?? ""}`.trim() || null,
  }));
}
