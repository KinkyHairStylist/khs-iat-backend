import prisma from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/centralAppError";
import { getBookingHours, getBookingRules } from "../customer/salonSchedule";
import { parseClockToMinutes, type BookingRules } from "./bookingRules";
import { checkBookingAgainstRules, wallClockNowMs } from "./bookingRulesCheck";
import { activeAppointmentsSql } from "./bookingHolds";
import { openingHoursProblem, salonBlocked, type OpeningDay } from "./openingHours";
import { chooseStylist, eligibleStylists, type DayAppointment, type DayBlock, type Stylist } from "./stylistAssignment";

// Whether a salon can take a booking at a time, and who does it. Shared by
// new bookings, reschedules, restores and rebooks (customer and salon), so
// every one is checked the same way: opening hours, the salon's rules, other
// appointments (minus `excludeOrderId`, the booking being moved), blocked-out
// time and the stylists who are free.

type Db = Prisma.TransactionClient | typeof prisma;

export interface SlotRequest {
  salonId: string;
  date: string;
  time: string;
  durationMinutes: number;
  timezoneOffsetMinutes?: number;
  /** The stylist asked for, if any. */
  staffId?: string | null;
  /** Per service, the active staff assigned to it (empty = anyone). */
  assignedPerService: string[][];
  /** The booking being moved, so it doesn't clash with itself. */
  excludeOrderId?: string;
  /** Or its appointments by id (older bookings have no order id). */
  excludeAppointmentIds?: string[];
  /**
   * The salon booking for itself: its online notice rules (minimum lead time,
   * how far ahead, same-day cutoff) are for customers, so only "not in the
   * past" applies. Opening hours, clashes and blocked time still do.
   */
  asSalon?: boolean;
}

export type PreparedSlot = Awaited<ReturnType<typeof prepareSlot>>;
export interface SalonDay { existing: Array<DayAppointment & { date: string }>; blocks: DayBlock[] }

/** Everything the check reads outside the transaction (it doesn't change under the lock). */
export async function prepareSlot(salonId: string) {
  const [rules, hours, team] = await Promise.all([
    getBookingRules(salonId),
    getBookingHours(salonId) as Promise<OpeningDay[]>,
    prisma.staff.findMany({ where: { business_id: salonId, isActive: true }, select: { id: true, firstName: true, lastName: true } }) as Promise<Stylist[]>,
  ]);
  return { rules, hours, team };
}

/** Locks the salon's day for this transaction, so two bookings can't both take its last slot. */
export async function lockSalonDay(tx: Prisma.TransactionClient, salonId: string, date: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${salonId}:${date}`}))`;
}

/** The salon's appointments (with who's on each) and blocked time that day. */
export async function readSalonDay(db: Db, salonId: string, date: string, exclude: { orderId?: string; appointmentIds?: string[] } = {}): Promise<SalonDay> {
  const notThisOrder = exclude.orderId ? Prisma.sql`AND a."orderId" IS DISTINCT FROM ${exclude.orderId}` : Prisma.empty;
  const notThese = exclude.appointmentIds?.length ? Prisma.sql`AND a.id <> ALL(${exclude.appointmentIds}::uuid[])` : Prisma.empty;
  const [rows, blocks] = await Promise.all([
    db.$queryRaw<Array<{ date: string; time: string; duration: string; staffIds: string[] | null }>>`
      SELECT a.date, a.time, a.duration, ARRAY_REMOVE(ARRAY_AGG(ast.staff_id::text), NULL) AS "staffIds"
      FROM appointments a LEFT JOIN appointment_staff ast ON ast.appointment_id = a.id
      WHERE ${activeAppointmentsSql(salonId, date)} ${notThisOrder} ${notThese}
      GROUP BY a.id`,
    db.$queryRaw<DayBlock[]>`
      SELECT "startTime"::text AS "startTime", "endTime"::text AS "endTime", "teamMember"
      FROM blocked_time_slots WHERE "businessId" = ${salonId}::uuid AND date = ${date}::date`,
  ]);
  return { existing: rows.map((r) => ({ ...r, staffIds: r.staffIds ?? [] })), blocks };
}

const SALON_RULES = (rules: BookingRules): BookingRules => ({ ...rules, minimumLeadMinutes: 0, maximumAdvanceDays: 365, sameDayCutoffMinutes: null });

/** The stylist for the slot, or the reason it can't be booked (a sentence the person can act on). */
export function evaluateSlot(req: SlotRequest, prepared: PreparedSlot, day: SalonDay): { stylist: Stylist | null } | { problem: string } {
  const { hours, team } = prepared;
  const rules = req.asSalon ? SALON_RULES(prepared.rules) : prepared.rules;
  const startMinutes = parseClockToMinutes(req.time);
  if (startMinutes === null) return { problem: "Please choose a valid date and time." };

  const closed = openingHoursProblem(hours, req.date, startMinutes, req.durationMinutes);
  if (closed) return { problem: closed };
  const ruleProblem = checkBookingAgainstRules({
    rules, date: req.date, time: req.time, durationMinutes: req.durationMinutes,
    nowWallClockMs: wallClockNowMs(req.timezoneOffsetMinutes), existing: day.existing,
  });
  if (ruleProblem) return { problem: ruleProblem };
  if (salonBlocked(day.blocks, startMinutes, req.durationMinutes)) {
    return { problem: "The salon has blocked off that time. Please choose another time." };
  }

  const assignment = chooseStylist({
    requestedId: req.staffId,
    candidates: eligibleStylists(team, req.assignedPerService),
    slot: { startMinutes, durationMinutes: req.durationMinutes, bufferMinutes: rules.bufferMinutes },
    appointments: day.existing,
    blocks: day.blocks,
    allowDoubleBookings: rules.allowDoubleBookings,
  });
  if (!assignment.ok) {
    return {
      problem: assignment.reason === "not-eligible"
        ? "That stylist can't do the services you picked. Please choose another stylist, or any stylist."
        : "That stylist is no longer free at this time. Please choose another time or stylist.",
    };
  }
  return { stylist: assignment.stylist };
}

/**
 * Checks the slot (call inside a transaction, after lockSalonDay) and returns
 * the stylist who'll do it — null when the salon has nobody to assign.
 * Throws 400 with the reason.
 */
export async function claimSlot(tx: Prisma.TransactionClient, req: SlotRequest, prepared: PreparedSlot): Promise<Stylist | null> {
  const outcome = evaluateSlot(req, prepared, await readSalonDay(tx, req.salonId, req.date, { orderId: req.excludeOrderId, appointmentIds: req.excludeAppointmentIds }));
  if ("problem" in outcome) throw AppError.badRequest(outcome.problem);
  return outcome.stylist;
}
