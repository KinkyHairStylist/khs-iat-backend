import prisma from "../../lib/prisma/prisma";
import { resolveBookingRules, type BookingRules } from "../bookings/bookingRules";

// What the booking calendar needs to work out free times: opening hours,
// blocked-out time and the salon's upcoming appointments. Only the timing is
// sent — never who an appointment is with, what was booked, or the staff's
// private notes on a blocked slot.

export interface BookingHour { id: string; day: string; isOpen: boolean; startTime: string; endTime: string }
export interface BlockedSlot { date: string; startTime: string; endTime: string; teamMember: string | null }
export interface BusyAppointment { date: string; time: string; duration: string; staff: Array<{ id: string }> }

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Opening hours Monday → Sunday, times as "09:00:00". */
export async function getBookingHours(businessId: string): Promise<BookingHour[]> {
  const rows = await prisma.$queryRaw<BookingHour[]>`
    SELECT id, day, "isOpen", "startTime"::text AS "startTime", "endTime"::text AS "endTime"
    FROM booking_days WHERE "businessId" = ${businessId}::uuid`;
  const rank = (day: string) => {
    const i = DAY_ORDER.indexOf(day);
    return i === -1 ? DAY_ORDER.length : i;
  };
  return rows.sort((a, b) => rank(a.day) - rank(b.day));
}

/** Blocked-out time from yesterday on (yesterday covers time zones behind the server's). */
export async function getUpcomingBlockedSlots(businessId: string): Promise<BlockedSlot[]> {
  return prisma.$queryRaw<BlockedSlot[]>`
    SELECT date::text AS date, "startTime"::text AS "startTime", "endTime"::text AS "endTime", "teamMember"
    FROM blocked_time_slots
    WHERE "businessId" = ${businessId}::uuid AND date >= CURRENT_DATE - 1
    ORDER BY date, "startTime"`;
}

/** Appointments still holding a slot (not cancelled), from yesterday on, with the staff ids on each. */
export async function getUpcomingAppointments(businessId: string): Promise<BusyAppointment[]> {
  // Dates are stored as "YYYY-MM-DD" text, so text comparison orders them correctly.
  const rows = await prisma.$queryRaw<Array<Omit<BusyAppointment, "staff"> & { staffIds: string[] | null }>>`
    SELECT a.date, a.time, a.duration,
           ARRAY_REMOVE(ARRAY_AGG(ast.staff_id::text), NULL) AS "staffIds"
    FROM appointments a
    LEFT JOIN appointment_staff ast ON ast.appointment_id = a.id
    WHERE a.business_id = ${businessId}::uuid
      AND a.status <> 'Cancelled'
      AND a.date >= TO_CHAR(CURRENT_DATE - 1, 'YYYY-MM-DD')
    GROUP BY a.id
    ORDER BY a.date, a.time`;
  return rows.map(({ staffIds, ...rest }) => ({ ...rest, staff: (staffIds ?? []).map((id) => ({ id })) }));
}

/** The salon's booking rules, from its policies and owner settings. */
export async function getBookingRules(businessId: string): Promise<BookingRules> {
  const [policies, settings] = await Promise.all([
    prisma.booking_policies.findUnique({
      where: { businessId },
      select: { minimumLeadTime: true, bufferTime: true },
    }),
    prisma.business_owner_settings.findUnique({
      where: { businessId },
      select: {
        bookingRulesMinimumleadtimehours: true,
        bookingRulesBuffertimebetweenappointmentsminutes: true,
        bookingRulesMaximumadvancebookingdays: true,
        bookingRulesSamedaybookingcutoff: true,
        bookingRulesAllowdoublebookings: true,
      },
    }),
  ]);
  return resolveBookingRules({
    policies,
    settings: settings && {
      minimumLeadTimeHours: settings.bookingRulesMinimumleadtimehours,
      bufferMinutes: settings.bookingRulesBuffertimebetweenappointmentsminutes,
      maximumAdvanceDays: settings.bookingRulesMaximumadvancebookingdays,
      sameDayCutoff: settings.bookingRulesSamedaybookingcutoff,
      allowDoubleBookings: settings.bookingRulesAllowdoublebookings,
    },
  });
}
