import { calendarTimeZone, deleteEvent, insertEvent, updateEvent, type CalendarEvent } from "../../../lib/integrations/googleCalendar";
import prisma from "../../../lib/prisma/prisma";
import redis from "../../../lib/redis/redis";
import { formatMoney } from "../../../utils/money";
import { parseDurationToMinutes, wallClockMs } from "../../bookings/bookingRulesCheck";
import { googleAccess } from "./credentials";
import { isOnCalendar, type SyncAppointment, type SyncOrder } from "./syncOrder";

// The salon's Google Calendar follows its bookings: an event per appointment,
// moved when it's rescheduled and removed when it's cancelled. The client and
// assigned staff are invited. Appointment times are wall-clock, so they're
// written in the calendar's own time zone.

const ZONE_TTL_MS = 3_600_000;
const zones = new Map<string, { zone: string; at: number }>();

async function zoneFor(businessId: string, accessToken: string, calendarId: string): Promise<string> {
  const hit = zones.get(businessId);
  if (hit && Date.now() - hit.at < ZONE_TTL_MS) return hit.zone;
  const zone = await calendarTimeZone(accessToken, calendarId);
  zones.set(businessId, { zone, at: Date.now() });
  return zone;
}

const fullName = (p: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}`.trim() : "") || "Client";

function buildEvent(order: SyncOrder, a: SyncAppointment, timeZone: string): CalendarEvent | null {
  const start = wallClockMs(a.date, a.time);
  if (start === null) return null;
  const end = start + parseDurationToMinutes(a.duration) * 60_000;
  const local = (ms: number) => new Date(ms).toISOString().slice(0, 19);
  const client = fullName(order.client);
  const staff = a.staff.filter((s) => s.email);
  return {
    summary: `${a.serviceName} - ${client}`,
    description: [
      `Service: ${a.serviceName}`,
      `Client: ${client}`,
      a.staff.length ? `Staff: ${a.staff.map((s) => s.firstName).filter(Boolean).join(", ")}` : "",
      `Duration: ${a.duration}`,
      `Amount: ${formatMoney(a.amount)}`,
      `Booking: ${a.orderId ?? a.id}`,
      a.specialRequests ? `\nSpecial requests: ${a.specialRequests}` : "",
    ].filter(Boolean).join("\n"),
    start: { dateTime: local(start), timeZone },
    end: { dateTime: local(end), timeZone },
    attendees: [
      ...(order.client?.email ? [{ email: order.client.email, displayName: client }] : []),
      ...staff.map((s) => ({ email: s.email!, displayName: `${s.firstName} ${s.lastName}`.trim() })),
    ],
    reminders: { useDefault: false, overrides: [{ method: "email", minutes: 24 * 60 }, { method: "popup", minutes: 60 }] },
    colorId: "2",
  };
}

/** Creates or updates the event of every appointment still on the calendar. */
export async function placeOnCalendar(order: SyncOrder): Promise<void> {
  const access = await googleAccess(order.businessId);
  if (!access) return;
  const timeZone = await zoneFor(order.businessId, access.accessToken, access.calendarId);
  for (const a of order.rows) {
    // Confirmed/rescheduled ones, plus a salon's pending booking that already has an event (moved).
    if (!isOnCalendar(a) && !(a.status === "Pending" && a.googleEventId)) continue;
    const event = buildEvent(order, a, timeZone);
    if (!event) continue;
    // Two syncs of one appointment at once would create two events.
    const lock = `integration:gcal:${a.id}`;
    if (!(await redis.set(lock, "1", "EX", 60, "NX"))) continue;
    try {
      if (a.googleEventId && (await updateEvent(access.accessToken, access.calendarId, a.googleEventId, event))) continue;
      const id = await insertEvent(access.accessToken, access.calendarId, event);
      await prisma.appointments.updateMany({ where: { id: a.id }, data: { googleEventId: id } });
    } finally {
      await redis.del(lock);
    }
  }
}

/** Removes the events of cancelled appointments (completed ones stay as a record). */
export async function removeFromCalendar(order: SyncOrder): Promise<void> {
  const gone = order.rows.filter((a) => a.status === "Cancelled" && a.googleEventId);
  if (gone.length === 0) return;
  const access = await googleAccess(order.businessId);
  if (!access) return;
  for (const a of gone) {
    await deleteEvent(access.accessToken, access.calendarId, a.googleEventId!);
    await prisma.appointments.updateMany({ where: { id: a.id, googleEventId: a.googleEventId }, data: { googleEventId: null } });
  }
}

export const forgetCalendarZone = (businessId: string) => zones.delete(businessId);
