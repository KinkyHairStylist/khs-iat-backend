import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import { BUSINESS_COLUMNS, SERVICE_COLUMNS, groupByBusiness, type BusinessRow, type ServiceRow } from "./salonColumns";
import { getBookingHours, getBookingRules, getUpcomingAppointments, getUpcomingBlockedSlots } from "./salonSchedule";

// The salon page: the salon, its services (with who can do each), its team,
// and everything the booking calendar needs. Same shape as the
// Kinky-Hair-Stylist backend's GET /business/:id/services, minus the staff's
// email addresses and phone numbers and the appointments' details.

export interface PublicStaff {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  avatar: string | null;
}

type StaffRow = Omit<PublicStaff, "name">;
type AssignmentRow = StaffRow & { serviceId: string };

const fullName = (s: StaffRow) => `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || "Staff Member";
const toPublicStaff = ({ id, firstName, lastName, role, avatar }: StaffRow): PublicStaff => ({
  id, name: fullName({ id, firstName, lastName, role, avatar }), firstName, lastName, role, avatar,
});

async function getServicesWithStaff(businessId: string) {
  const [services, assignments] = await Promise.all([
    prisma.$queryRaw<ServiceRow[]>`
      SELECT ${SERVICE_COLUMNS} FROM "Service" s
      WHERE s."businessId" = ${businessId}::uuid ORDER BY s."createdAt" ASC, s.id`,
    // Only active team members can be booked.
    prisma.$queryRaw<AssignmentRow[]>`
      SELECT ss."serviceId", st.id, st."firstName", st."lastName", st.role::text AS role, st.avatar
      FROM service_staff ss
      JOIN staff st ON st.id = ss."staffId"
      JOIN "Service" s ON s.id = ss."serviceId"
      WHERE s."businessId" = ${businessId}::uuid AND st."isActive" = true`,
  ]);
  const staffByService = groupByBusiness(assignments.map((a) => ({ ...a, businessId: a.serviceId })));
  return services.map((service) => ({
    ...service,
    assignedStaff: (staffByService.get(service.id) ?? []).map(toPublicStaff),
  }));
}

async function getActiveStaff(businessId: string): Promise<PublicStaff[]> {
  const rows = await prisma.$queryRaw<StaffRow[]>`
    SELECT id, "firstName", "lastName", role::text AS role, avatar
    FROM staff WHERE business_id = ${businessId}::uuid AND "isActive" = true
    ORDER BY "firstName" ASC NULLS LAST, id`;
  return rows.map(toPublicStaff);
}

/** An approved salon's page. 404 for an unknown, pending or suspended salon. */
export async function getSalonDetail(businessId: string) {
  const [business] = await prisma.$queryRaw<BusinessRow[]>`
    SELECT ${BUSINESS_COLUMNS} FROM businesses b
    WHERE b.id = ${businessId}::uuid AND b.status = 'approved'`;
  if (!business) throw AppError.notFound("Salon");

  const [serviceList, staff, bookingHours, blockedSlots, appointments, bookingRules] = await Promise.all([
    getServicesWithStaff(businessId),
    getActiveStaff(businessId),
    getBookingHours(businessId),
    getUpcomingBlockedSlots(businessId),
    getUpcomingAppointments(businessId),
    getBookingRules(businessId),
  ]);

  return { ...business, serviceList, staff, bookingHours, blockedSlots, appointments, bookingRules };
}

// The one place a salon id from a URL is checked to exist and be public.
export async function assertPublicSalon(businessId: string): Promise<void> {
  const found = await prisma.businesses.findFirst({ where: { id: businessId, status: "approved" }, select: { id: true } });
  if (!found) throw AppError.notFound("Salon");
}
