import prisma from "../../../lib/prisma/prisma";
import { liveBookingSql } from "../../bookings/bookingHolds";
import { parseClockToMinutes } from "../../bookings/bookingRules";
import { parseDurationToMinutes } from "../../bookings/bookingRulesCheck";
import { type DateRange, type Period, growth, monthOf, periodBounds, weekOf } from "../../../utils/datePeriods";
import { requireMerchantBusiness } from "../merchantBusiness";

// The merchant dashboard: one call for the home page and one for the overview
// cards (by period). Everything is worked out here from the salon's own
// bookings, instead of the browser downloading every booking to count them.

// Bookings that bring money in (rescheduled ones are paid bookings moved to another time).
const EARNING = new Set(["Confirmed", "Rescheduled", "Completed"]);

interface Row {
  id: string;
  date: string;
  time: string;
  status: string;
  amount: number;
  duration: string;
  serviceName: string;
  clientKey: string | null;
}

function bookingsBetween(businessId: string, range: DateRange) {
  return prisma.$queryRaw<Row[]>`
    SELECT a.id::text AS id, a.date, a.time, a.status::text AS status, a.amount, a.duration, a."serviceName",
           COALESCE(a.client_id::text, a.business_client_id::text) AS "clientKey"
    FROM appointments a
    WHERE a.business_id = ${businessId}::uuid AND a.date BETWEEN ${range.start} AND ${range.end} AND ${liveBookingSql()}`;
}

const cents = (n: number) => Math.round((Number(n) || 0) * 100);

function summarize(rows: Row[], range: DateRange) {
  const inRange = rows.filter((r) => r.date >= range.start && r.date <= range.end);
  const revenueCents = inRange.filter((r) => EARNING.has(r.status)).reduce((sum, r) => sum + cents(r.amount), 0);
  const clients = new Set(inRange.map((r) => r.clientKey).filter(Boolean));
  const minutes = inRange.reduce((sum, r) => sum + parseDurationToMinutes(r.duration), 0);
  return {
    revenue: revenueCents / 100,
    bookings: inRange.length,
    activeClients: clients.size,
    averageServiceTimeMinutes: inRange.length ? Math.round(minutes / inRange.length) : 0,
  };
}

/** The four overview cards for a period, each with its change from the period before. */
export async function getDashboardStats(userId: string, period: Period, date: string) {
  const business = await requireMerchantBusiness(userId);
  const bounds = periodBounds(period, date);
  const rows = await bookingsBetween(business.id, { start: bounds.previous.start, end: bounds.current.end });
  const now = summarize(rows, bounds.current);
  const before = summarize(rows, bounds.previous);
  const metric = (key: keyof typeof now) => ({ current: now[key], previous: before[key], growth: growth(now[key], before[key]) });
  return {
    period,
    metrics: {
      revenue: metric("revenue"),
      bookings: metric("bookings"),
      activeClients: metric("activeClients"),
      averageServiceTimeMinutes: metric("averageServiceTimeMinutes"),
    },
  };
}

/** Customers (accounts) and the salon's own client records, by id, as display names. */
async function clientNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const [users, records] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, surname: true } }),
    prisma.clients.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const names = new Map<string, string>();
  for (const u of users) names.set(u.id, `${u.firstName ?? ""} ${u.surname ?? ""}`.trim());
  for (const c of records) names.set(c.id, `${c.firstName} ${c.lastName}`.trim());
  return names;
}

async function staffOnBookings(appointmentIds: string[]): Promise<Map<string, string[]>> {
  if (!appointmentIds.length) return new Map();
  const rows = await prisma.$queryRaw<Array<{ appointmentId: string; name: string }>>`
    SELECT ast.appointment_id::text AS "appointmentId", TRIM(CONCAT(s."firstName", ' ', s."lastName")) AS name
    FROM appointment_staff ast JOIN staff s ON s.id = ast.staff_id
    WHERE ast.appointment_id = ANY(${appointmentIds}::uuid[])`;
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.appointmentId, [...(map.get(r.appointmentId) ?? []), r.name]);
  return map;
}

/** The three team members with the most revenue this week (Sunday to Saturday), with bookings and rating. */
async function topTeam(businessId: string, week: DateRange) {
  const rows = await prisma.$queryRaw<Array<{ id: string; firstName: string | null; lastName: string | null; role: string; jobTitle: string | null; avatar: string | null; bookings: number; revenue: number; rating: number | null }>>`
    SELECT s.id::text AS id, s."firstName", s."lastName", s.role::text AS role, s."jobTitle", s.avatar,
           COUNT(a.id) FILTER (WHERE a.status IN ('Confirmed', 'Rescheduled', 'Completed'))::int AS bookings,
           COALESCE(SUM(a.amount) FILTER (WHERE a.status = 'Completed'), 0)::float AS revenue,
           (SELECT AVG(r."staffRating")::float FROM reviews r WHERE r."staffId" = s.id AND r."staffRating" IS NOT NULL) AS rating
    FROM staff s
    LEFT JOIN appointment_staff ast ON ast.staff_id = s.id
    LEFT JOIN appointments a ON a.id = ast.appointment_id AND a.date BETWEEN ${week.start} AND ${week.end}
    WHERE s.business_id = ${businessId}::uuid AND s."isActive" = true
    GROUP BY s.id
    ORDER BY revenue DESC, bookings DESC, s."firstName" ASC
    LIMIT 3`;
  return rows.map((s) => ({
    id: s.id,
    name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(),
    role: s.jobTitle || s.role,
    avatar: s.avatar,
    bookings: s.bookings,
    revenue: Math.round(s.revenue * 100) / 100,
    rating: s.rating !== null ? Math.round(s.rating * 10) / 10 : null,
  }));
}

/** The home page: today's bookings, this month's progress, satisfaction and the top of the team. */
export async function getDashboardHome(userId: string, date: string) {
  const business = await requireMerchantBusiness(userId);
  const month = monthOf(date);
  const monthStart = new Date(`${month.start}T00:00:00Z`);
  const monthEnd = new Date(new Date(`${month.end}T00:00:00Z`).getTime() + 86_400_000);

  const [monthRows, satisfaction, team, serviceCount] = await Promise.all([
    bookingsBetween(business.id, month),
    prisma.reviews.aggregate({ where: { businessId: business.id, createdAt: { gte: monthStart, lt: monthEnd } }, _avg: { rating: true }, _count: true }),
    topTeam(business.id, weekOf(date)),
    prisma.service.count({ where: { businessId: business.id } }),
  ]);

  const today = monthRows
    .filter((r) => r.date === date)
    .sort((x, y) => (parseClockToMinutes(x.time) ?? 0) - (parseClockToMinutes(y.time) ?? 0));
  const [names, staff] = await Promise.all([
    clientNames([...new Set(today.map((r) => r.clientKey).filter((k): k is string => !!k))]),
    staffOnBookings(today.map((r) => r.id)),
  ]);

  const monthSummary = summarize(monthRows, month);
  const average = satisfaction._count ? Math.round(Number(satisfaction._avg.rating) * 10) / 10 : null;

  return {
    business,
    hasServices: serviceCount > 0,
    today: today.map((r) => ({
      id: r.id,
      clientName: (r.clientKey && names.get(r.clientKey)) || null,
      service: r.serviceName,
      time: r.time,
      stylists: staff.get(r.id) ?? [],
      status: r.status,
      amount: r.amount,
      durationMinutes: parseDurationToMinutes(r.duration),
    })),
    month: {
      bookings: monthSummary.bookings,
      completed: monthRows.filter((r) => r.status === "Completed").length,
      revenue: monthSummary.revenue,
    },
    satisfaction: { average, count: satisfaction._count, percent: average !== null ? Math.round((average / 5) * 100) : 0 },
    topTeam: team,
  };
}
