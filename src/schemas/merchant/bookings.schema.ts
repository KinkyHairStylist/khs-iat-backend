import { z } from "zod";
import { appointmentTime, calendarDate, timezoneOffset } from "../fields";

// The salon's bookings calendar: its own bookings, changes to any booking, and blocked-out time.

const MAX_RANGE_DAYS = 62;
const id = (what: string) => z.string().uuid(`Please choose a valid ${what}.`);
const note = (label: string, max: number) => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).optional();
const daysBetween = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/** ?from=&to= — the calendar's visible days (at most two months, so one request can't read years of bookings). */
export const dateRangeQuerySchema = z
  .object({ from: calendarDate(), to: calendarDate() })
  .refine((r) => r.from <= r.to, { message: "The end date must be on or after the start date.", path: ["to"] })
  .refine((r) => daysBetween(r.from, r.to) <= MAX_RANGE_DAYS, { message: `Please pick at most ${MAX_RANGE_DAYS} days.`, path: ["to"] });

/** Free times on a day: for a service (new booking) or for an existing booking (reschedule). */
export const availableTimesQuerySchema = z
  .object({
    date: calendarDate(),
    serviceId: id("service").optional(),
    bookingId: id("booking").optional(),
    timezoneOffsetMinutes: z.coerce.number().int().min(-14 * 60).max(14 * 60).optional(),
  })
  .refine((q) => !!q.serviceId !== !!q.bookingId, { message: "Choose a service or a booking." });

export const createSalonBookingSchema = z.object({
  clientId: id("client"),
  serviceId: id("service"),
  date: calendarDate(),
  time: appointmentTime(),
  staffId: id("stylist").optional(),
  specialRequests: note("Notes", 1000),
  timezoneOffsetMinutes: timezoneOffset,
});
export type CreateSalonBookingInput = z.infer<typeof createSalonBookingSchema>;

export const salonRescheduleSchema = z.object({
  date: calendarDate(),
  time: appointmentTime(),
  reason: note("The reason", 500),
  timezoneOffsetMinutes: timezoneOffset,
});
export type SalonRescheduleInput = z.infer<typeof salonRescheduleSchema>;

export const salonCancelSchema = z.object({ reason: note("The reason", 1000) });
export const completeBookingSchema = z.object({ notes: note("Notes", 1000), timezoneOffsetMinutes: timezoneOffset });
export const noShowSchema = z.object({ timezoneOffsetMinutes: timezoneOffset });

export const assignStaffSchema = z.object({
  staffIds: z.array(id("stylist")).max(10, "Assign up to 10 people.").transform((ids) => [...new Set(ids)]),
});

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times look like 09:30.");
export const BLOCK_TYPES = ["custom", "lunch", "meeting", "training"] as const;

export const blockedTimeSchema = z
  .object({
    type: z.enum(BLOCK_TYPES).default("custom"),
    title: z.string().trim().min(1, "Please add a title.").max(80, "The title must be 80 characters or fewer."),
    date: calendarDate(),
    startTime: clock,
    endTime: clock,
    // A team member's full name (how the calendar and booking checks match it); empty blocks the whole salon.
    teamMember: z.string().trim().max(120).optional().default(""),
    description: z.string().trim().min(1, "Please add a description.").max(120, "The description must be 120 characters or fewer."),
  })
  .refine((b) => b.startTime < b.endTime, { message: "The end time must be after the start time.", path: ["endTime"] });
export type BlockedTimeInput = z.infer<typeof blockedTimeSchema>;
