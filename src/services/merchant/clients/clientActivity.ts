import prisma from "../../../lib/prisma/prisma";
import { holdCutoff } from "../../bookings/bookingHolds";
import { addDays, growth, monthOf, weekOf, yearOf, type DateRange } from "../../../utils/datePeriods";
import { requireMerchantBusiness } from "../merchantBusiness";
import { clientAppointmentJoin, bookingsOfClients, type ClientBookingRow } from "./clientLinks";
import { ownClient } from "./clientQueries";

// A client's bookings with the salon, and the overview tab: what their
// bookings were worth in the chosen period (the old chart was made-up data),
// with their counts.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const cents = (rows: ClientBookingRow[]) => rows.reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);

export async function clientAppointments(userId: string, clientId: string) {
  const business = await requireMerchantBusiness(userId);
  await ownClient(business.ownerId, clientId);
  const rows = await prisma.$queryRaw<Array<{ id: string; date: string; time: string; status: string; amount: number; serviceName: string; staff: string | null }>>`
    SELECT a.id::text AS id, a.date, a.time, a.status::text AS status, a.amount, a."serviceName",
           (SELECT STRING_AGG(TRIM(CONCAT(s."firstName", ' ', s."lastName")), ', ') FROM appointment_staff ast JOIN staff s ON s.id = ast.staff_id WHERE ast.appointment_id = a.id) AS staff
    FROM clients c JOIN appointments a ON ${clientAppointmentJoin(business.ownerId)}
    WHERE c.id = ${clientId}::uuid AND NOT (a.status = 'Pending' AND a.client_id IS NOT NULL AND a."createdAt" < ${holdCutoff()})
    ORDER BY a.date DESC, a."createdAt" DESC
    LIMIT 500`;
  return rows;
}

interface Bucket { label: string; range: DateRange }

/** Week: its 7 days. Month: its weeks. Year: its months. And the period before. */
function buckets(period: "week" | "month" | "year", date: string): { current: DateRange; previous: DateRange; parts: Bucket[] } {
  if (period === "week") {
    const current = weekOf(date);
    const parts = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(current.start, i);
      return { label: `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`, range: { start: day, end: day } };
    });
    return { current, previous: { start: addDays(current.start, -7), end: addDays(current.start, -1) }, parts };
  }
  if (period === "month") {
    const current = monthOf(date);
    const parts: Bucket[] = [];
    for (let start = current.start, n = 1; start <= current.end; start = addDays(start, 7), n++) {
      const end = addDays(start, 6) > current.end ? current.end : addDays(start, 6);
      parts.push({ label: `Wk ${n}`, range: { start, end } });
    }
    return { current, previous: monthOf(addDays(current.start, -1)), parts };
  }
  const current = yearOf(date);
  const year = current.start.slice(0, 4);
  const parts = MONTHS.map((label, i) => monthOf(`${year}-${String(i + 1).padStart(2, "0")}-01`)).map((range, i) => ({ label: MONTHS[i], range }));
  return { current, previous: yearOf(addDays(current.start, -1)), parts };
}

export async function clientOverview(userId: string, clientId: string, period: "week" | "month" | "year", date: string) {
  const business = await requireMerchantBusiness(userId);
  const client = await ownClient(business.ownerId, clientId);
  const rows = await bookingsOfClients(business.ownerId, [clientId]);
  const completed = rows.filter((r) => r.status === "Completed");
  const inRange = (r: ClientBookingRow, range: DateRange) => r.date >= range.start && r.date <= range.end;
  const plan = buckets(period, date);
  const now = cents(completed.filter((r) => inRange(r, plan.current))) / 100;
  const before = cents(completed.filter((r) => inRange(r, plan.previous))) / 100;
  const rating = await prisma.$queryRaw<Array<{ average: number | null }>>`
    SELECT AVG(r.rating)::float AS average FROM reviews r JOIN "user" u ON u.id::text = r."clientId"
    WHERE LOWER(u.email) = LOWER(${client.email}) AND r."businessId" IN (SELECT b.id FROM businesses b WHERE b.owner_id = ${business.ownerId}::uuid)`;

  return {
    period,
    total: now,
    previousTotal: before,
    growth: growth(now, before),
    buckets: plan.parts.map((p) => ({ label: p.label, value: cents(completed.filter((r) => inRange(r, p.range))) / 100 })),
    appointments: rows.length,
    cancelled: rows.filter((r) => r.status === "Cancelled").length,
    noShows: rows.filter((r) => r.status === "No Show").length,
    rating: rating[0]?.average != null ? Math.round(rating[0].average * 10) / 10 : 0,
  };
}
