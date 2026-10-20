import prisma from "../../../lib/prisma/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { AppError } from "../../../middlewares/centralAppError";
import { liveBookingSql } from "../../bookings/bookingHolds";
import { parseClockToMinutes } from "../../bookings/bookingRules";
import { parseDurationToMinutes } from "../../bookings/bookingRulesCheck";
import { weekOf } from "../../../utils/datePeriods";
import { requireMerchantBusiness } from "../merchantBusiness";
import { fullName } from "../bookings/salonOrder";

// Reading the salon's team: each active member with their week (bookings,
// earnings, commission), rating and next appointment — worked out here in a
// few grouped queries (every old card downloaded all bookings and services).

export const STAFF_SELECT = {
  id: true, firstName: true, lastName: true, email: true, phoneNumber: true, gender: true, dob: true, jobTitle: true, role: true,
  avatar: true, employmentType: true, settings: true, commissionRate: true,
  addresses: { select: { name: true, location: true, isPrimary: true } },
  emergency_contacts: { select: { firstName: true, lastName: true, relationship: true, email: true, phoneNumber: true } },
  service_staff: { select: { serviceId: true } },
} satisfies Prisma.staffSelect;

type StaffRow = Prisma.staffGetPayload<{ select: typeof STAFF_SELECT }>;

export function staffView(s: StaffRow) {
  return {
    id: s.id,
    firstName: s.firstName ?? "",
    lastName: s.lastName ?? "",
    name: fullName(s.firstName, s.lastName),
    email: s.email ?? "",
    phoneNumber: s.phoneNumber ?? "",
    gender: s.gender ?? "",
    dob: s.dob ?? "",
    jobTitle: s.jobTitle ?? "",
    role: s.role,
    avatar: s.avatar,
    employmentType: s.employmentType ?? "",
    settings: s.settings,
    commissionRate: s.commissionRate === null ? null : Number(s.commissionRate),
    addresses: s.addresses,
    emergencyContacts: s.emergency_contacts,
    servicesAssigned: s.service_staff.map((x) => x.serviceId),
  };
}

interface WeekRow { staffId: string; bookings: number; earnings: number }
interface NextRow { staffId: string; date: string; time: string; serviceName: string }

export async function listTeam(userId: string, date: string) {
  const business = await requireMerchantBusiness(userId);
  const week = weekOf(date);
  const team = await prisma.staff.findMany({ where: { business_id: business.id, isActive: true }, select: STAFF_SELECT, orderBy: { firstName: "asc" } });
  const ids = team.map((s) => s.id);
  if (ids.length === 0) return [];

  const [weekRows, upcoming, ratings, commissions] = await Promise.all([
    prisma.$queryRaw<WeekRow[]>`
      SELECT ast.staff_id::text AS "staffId",
             COUNT(*) FILTER (WHERE a.status IN ('Confirmed', 'Rescheduled', 'Completed'))::int AS bookings,
             COALESCE(SUM(a.amount) FILTER (WHERE a.status = 'Completed'), 0)::float AS earnings
      FROM appointment_staff ast JOIN appointments a ON a.id = ast.appointment_id
      WHERE ast.staff_id = ANY(${ids}::uuid[]) AND a.date BETWEEN ${week.start} AND ${week.end}
      GROUP BY ast.staff_id`,
    prisma.$queryRaw<NextRow[]>`
      SELECT ast.staff_id::text AS "staffId", a.date, a.time, a."serviceName"
      FROM appointment_staff ast JOIN appointments a ON a.id = ast.appointment_id
      WHERE ast.staff_id = ANY(${ids}::uuid[]) AND a.status IN ('Confirmed', 'Rescheduled') AND a.date >= ${date}
      ORDER BY a.date`,
    prisma.reviews.groupBy({ by: ["staffId"], where: { staffId: { in: ids }, staffRating: { not: null } }, _avg: { staffRating: true }, _count: { staffRating: true } }),
    prisma.staff_commission_earnings.groupBy({
      by: ["staffId"], where: { staffId: { in: ids }, createdAt: { gte: new Date(`${week.start}T00:00:00Z`) } }, _sum: { commissionAmount: true },
    }),
  ]);

  // The soonest Confirmed/Rescheduled appointment from today on, per person.
  const next = new Map<string, NextRow>();
  for (const r of upcoming) {
    const current = next.get(r.staffId);
    const sooner = !current || r.date < current.date || (r.date === current.date && (parseClockToMinutes(r.time) ?? 0) < (parseClockToMinutes(current.time) ?? 0));
    if (sooner) next.set(r.staffId, r);
  }
  const byWeek = new Map(weekRows.map((r) => [r.staffId, r]));
  const byRating = new Map(ratings.map((r) => [r.staffId, r]));
  const byCommission = new Map(commissions.map((r) => [r.staffId, Number(r._sum.commissionAmount ?? 0)]));

  return team.map((s) => {
    const w = byWeek.get(s.id);
    const r = byRating.get(s.id);
    const n = next.get(s.id);
    return {
      ...staffView(s),
      rating: r?._avg.staffRating ? Math.round(Number(r._avg.staffRating) * 10) / 10 : 0,
      reviews: r?._count.staffRating ?? 0,
      stats: { bookingsThisWeek: w?.bookings ?? 0, earningsThisWeek: Math.round((w?.earnings ?? 0) * 100) / 100 },
      commissionEarnedThisWeek: Math.round((byCommission.get(s.id) ?? 0) * 100) / 100,
      nextAppointment: n ? { date: n.date, time: n.time, type: n.serviceName } : null,
    };
  });
}

/** A team member's bookings from the start of this week on (the schedule panel and profile). */
export async function staffSchedule(userId: string, staffId: string, date: string) {
  const business = await requireMerchantBusiness(userId);
  const member = await prisma.staff.findFirst({ where: { id: staffId, business_id: business.id }, select: { id: true } });
  if (!member) throw AppError.notFound("Team member");
  const rows = await prisma.$queryRaw<Array<{ id: string; date: string; time: string; duration: string; status: string; amount: number; serviceName: string; clientName: string | null }>>`
    SELECT a.id::text AS id, a.date, a.time, a.duration, a.status::text AS status, a.amount, a."serviceName",
           COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u.surname)), ''), NULLIF(TRIM(CONCAT(c."firstName", ' ', c."lastName")), '')) AS "clientName"
    FROM appointment_staff ast JOIN appointments a ON a.id = ast.appointment_id
    LEFT JOIN "user" u ON u.id = a.client_id
    LEFT JOIN clients c ON c.id = a.business_client_id
    WHERE ast.staff_id = ${staffId}::uuid AND a.business_id = ${business.id}::uuid AND a.date >= ${weekOf(date).start} AND ${liveBookingSql()}
    ORDER BY a.date
    LIMIT 200`;
  return rows
    .map((r) => ({ ...r, durationMinutes: parseDurationToMinutes(r.duration) }))
    .sort((x, y) => (x.date === y.date ? (parseClockToMinutes(x.time) ?? 0) - (parseClockToMinutes(y.time) ?? 0) : x.date < y.date ? -1 : 1));
}
