import prisma from "../../../lib/prisma/prisma";
import { holdCutoff } from "../../bookings/bookingHolds";
import { parseDurationToMinutes } from "../../bookings/bookingRulesCheck";
import { requireMerchantBusiness } from "../merchantBusiness";
import { fullName, loadSalonOrder } from "./salonOrder";

// Reading the salon's bookings: the calendar (the visible days only — the old
// page downloaded every booking the salon ever had) and one booking in full.
// Only what the pages show is returned; never a customer's whole account row.

interface CalendarRow {
  id: string;
  orderId: string | null;
  date: string;
  time: string;
  duration: string;
  status: string;
  paymentStatus: string;
  serviceName: string;
  amount: number;
  clientName: string | null;
  isCustomerBooking: boolean;
  staff: Array<{ id: string; name: string }>;
}

/** The salon's bookings between two dates. A customer's checkout that was abandoned (an expired hold) isn't a booking and is left out. */
export async function listSalonBookings(userId: string, from: string, to: string) {
  const business = await requireMerchantBusiness(userId);
  const rows = await prisma.$queryRaw<CalendarRow[]>`
    SELECT a.id::text AS id, a."orderId", a.date, a.time, a.duration, a.status::text AS status, a."paymentStatus"::text AS "paymentStatus",
           a."serviceName", a.amount, a.client_id IS NOT NULL AS "isCustomerBooking",
           COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u.surname)), ''), NULLIF(TRIM(CONCAT(c."firstName", ' ', c."lastName")), '')) AS "clientName",
           COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id', s.id, 'name', TRIM(CONCAT(s."firstName", ' ', s."lastName")))) FILTER (WHERE s.id IS NOT NULL), '[]') AS staff
    FROM appointments a
    LEFT JOIN "user" u ON u.id = a.client_id
    LEFT JOIN clients c ON c.id = a.business_client_id
    LEFT JOIN appointment_staff ast ON ast.appointment_id = a.id
    LEFT JOIN staff s ON s.id = ast.staff_id
    WHERE a.business_id = ${business.id}::uuid AND a.date BETWEEN ${from} AND ${to}
      AND NOT (a.status = 'Pending' AND a.client_id IS NOT NULL AND a."createdAt" < ${holdCutoff()})
    GROUP BY a.id, u.id, c.id
    ORDER BY a.date, a.time`;
  return rows.map((r) => ({ ...r, durationMinutes: parseDurationToMinutes(r.duration) }));
}

async function clientOf(ownerId: string, clientId: string | null, businessClientId: string | null) {
  if (clientId) {
    const u = await prisma.user.findUnique({ where: { id: clientId }, select: { firstName: true, surname: true, email: true, phoneNumber: true, avatarUrl: true } });
    if (u) return { kind: "customer" as const, name: fullName(u.firstName, u.surname), email: u.email, phone: u.phoneNumber, avatar: u.avatarUrl };
  }
  if (businessClientId) {
    const c = await prisma.clients.findFirst({ where: { id: businessClientId, owner_id: ownerId }, select: { firstName: true, lastName: true, email: true, phone: true, profileImage: true } });
    if (c) return { kind: "client" as const, name: fullName(c.firstName, c.lastName), email: c.email, phone: c.phone, avatar: c.profileImage };
  }
  return null;
}

/** One booking with its client, services, team, payment and review. */
export async function getSalonBooking(userId: string, appointmentId: string) {
  const business = await requireMerchantBusiness(userId);
  const { opened, rows, orderId } = await loadSalonOrder(business.id, appointmentId);

  const serviceIds = rows.map((r) => r.service_id).filter((x): x is string => !!x);
  const [client, serviceStaff, payments, review, category] = await Promise.all([
    clientOf(business.ownerId, opened.client_id, opened.business_client_id),
    serviceIds.length ? prisma.service_staff.findMany({ where: { serviceId: { in: serviceIds } }, select: { staffId: true } }) : [],
    orderId
      ? prisma.stripe_payment_intents.findMany({
          where: { orderId, status: { in: ["held", "released", "refunded"] } },
          select: { stripePassthroughFeeAmount: true, isDeposit: true, status: true },
        })
      : [],
    orderId ? prisma.reviews.findFirst({ where: { orderId, businessId: business.id }, select: { id: true, rating: true, comment: true, createdAt: true } }) : null,
    opened.service_id ? prisma.service.findUnique({ where: { id: opened.service_id }, select: { category: true } }) : null,
  ]);

  const serviceTotal = rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100;
  const transactionFee = payments.reduce((sum, p) => sum + Math.round(Number(p.stripePassthroughFeeAmount) * 100), 0) / 100;

  return {
    id: opened.id,
    referenceId: orderId ?? opened.id,
    status: opened.status,
    createdAt: opened.createdAt,
    client,
    appointment: { date: opened.date, time: opened.time, duration: opened.duration, category: category?.category ?? null },
    staff: opened.appointment_staff.map(({ staff }) => ({ id: staff.id, name: fullName(staff.firstName, staff.lastName), avatar: staff.avatar })),
    serviceStaffIds: [...new Set(serviceStaff.map((s) => s.staffId))],
    services: rows.map((r) => ({ id: r.id, name: r.serviceName, duration: r.duration, price: r.amount, status: r.status })),
    payment: {
      serviceTotal,
      transactionFee,
      totalAmount: (Math.round(serviceTotal * 100) + Math.round(transactionFee * 100)) / 100,
      status: opened.paymentStatus,
      deposit: payments.some((p) => p.isDeposit),
      refunded: payments.length > 0 && payments.every((p) => p.status === "refunded"),
    },
    notes: opened.specialRequests || opened.cancellationsNote || null,
    review: review ? { id: review.id, rating: Number(review.rating), comment: review.comment, createdAt: review.createdAt } : null,
  };
}

/** What the new-booking form offers: the salon's client records, services and team. */
export async function getBookingFormOptions(userId: string) {
  const business = await requireMerchantBusiness(userId);
  const [clients, services, team] = await Promise.all([
    prisma.clients.findMany({
      where: { owner_id: business.ownerId, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 1000,
    }),
    prisma.service.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true, duration: true, price: true, minPrice: true, maxPrice: true },
      orderBy: { name: "asc" },
    }),
    prisma.staff.findMany({
      where: { business_id: business.id, isActive: true },
      select: { id: true, firstName: true, lastName: true, avatar: true },
      orderBy: { firstName: "asc" },
    }),
  ]);
  return {
    clients: clients.map((c) => ({ id: c.id, name: fullName(c.firstName, c.lastName) || c.email })),
    services: services.map((s) => ({
      id: s.id,
      name: s.name ?? "Service",
      duration: s.duration ?? "30",
      durationMinutes: parseDurationToMinutes(s.duration),
      price: Number(s.price ?? s.minPrice ?? s.maxPrice ?? 0),
    })),
    team: team.map((s) => ({ id: s.id, name: fullName(s.firstName, s.lastName), avatar: s.avatar })),
  };
}
