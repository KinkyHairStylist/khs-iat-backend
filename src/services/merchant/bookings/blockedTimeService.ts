import prisma from "../../../lib/prisma/prisma";
import { AppError } from "../../../middlewares/centralAppError";
import type { BlockedTimeInput } from "../../../schemas/merchant/bookings.schema";
import { requireMerchantBusiness } from "../merchantBusiness";
import { fullName } from "./salonOrder";

// Time the salon blocks off (lunch, meetings, training), for one team member
// or the whole salon. Bookings can't be made over it. A team member is stored
// by full name, as the calendar and the booking checks match it; it must be
// someone on the salon's active team (the old endpoint saved any text).

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toTime = (clock: string) => new Date(`1970-01-01T${clock}:00Z`);
const clockOf = (t: Date) => `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;

type Row = { id: string; type: string | null; title: string | null; date: Date; startTime: Date; endTime: Date; teamMember: string | null; description: string | null };

const view = (r: Row) => ({
  id: r.id, type: r.type ?? "custom", title: r.title ?? "", date: r.date.toISOString().slice(0, 10),
  startTime: clockOf(r.startTime), endTime: clockOf(r.endTime), teamMember: r.teamMember || "", description: r.description ?? "",
});

const SELECT = { id: true, type: true, title: true, date: true, startTime: true, endTime: true, teamMember: true, description: true } as const;

async function teamMemberName(businessId: string, name: string): Promise<string> {
  if (!name) return "";
  const team = await prisma.staff.findMany({ where: { business_id: businessId, isActive: true }, select: { firstName: true, lastName: true } });
  const match = team.map((s) => fullName(s.firstName, s.lastName)).find((n) => n.toLowerCase() === name.toLowerCase());
  if (!match) throw AppError.badRequest("Choose someone on your active team, or the whole salon.", "NOT_ON_TEAM");
  return match;
}

const data = (input: BlockedTimeInput, teamMember: string) => ({
  type: input.type, title: input.title, date: toDate(input.date), startTime: toTime(input.startTime), endTime: toTime(input.endTime),
  teamMember, description: input.description,
});

export async function listBlockedTimes(userId: string, from: string, to: string) {
  const business = await requireMerchantBusiness(userId);
  const rows = await prisma.blocked_time_slots.findMany({
    where: { businessId: business.id, date: { gte: toDate(from), lte: toDate(to) } },
    select: SELECT,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return rows.map(view);
}

export async function createBlockedTime(userId: string, input: BlockedTimeInput) {
  const business = await requireMerchantBusiness(userId);
  const teamMember = await teamMemberName(business.id, input.teamMember);
  return view(await prisma.blocked_time_slots.create({ data: { ...data(input, teamMember), businessId: business.id }, select: SELECT }));
}

export async function updateBlockedTime(userId: string, id: string, input: BlockedTimeInput) {
  const business = await requireMerchantBusiness(userId);
  const teamMember = await teamMemberName(business.id, input.teamMember);
  const updated = await prisma.blocked_time_slots.updateMany({ where: { id, businessId: business.id }, data: data(input, teamMember) });
  if (updated.count === 0) throw AppError.notFound("Blocked time");
  return view((await prisma.blocked_time_slots.findUnique({ where: { id }, select: SELECT }))!);
}

export async function deleteBlockedTime(userId: string, id: string) {
  const business = await requireMerchantBusiness(userId);
  const deleted = await prisma.blocked_time_slots.deleteMany({ where: { id, businessId: business.id } });
  if (deleted.count === 0) throw AppError.notFound("Blocked time");
}
