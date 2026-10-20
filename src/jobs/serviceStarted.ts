import { PLATFORM_TIME_ZONE } from "../config/env";
import prisma from "../lib/prisma/prisma";
import { wallClockMs } from "../services/bookings/bookingRulesCheck";
import { notifyUser } from "../services/notificationsService";
import { instantOfWallClock, isTimeZone } from "../utils/timeZone";

// Every minute: "your service has started" to the customer once a confirmed
// appointment's start time arrives. Appointment times are wall-clock text, read
// in the customer's time zone (the platform's when they haven't chosen one).
// Only starts within the last two hours count, so appointments nobody closed
// long ago never get a stale notice (the old cron sent one for every one of them).

const RECENT_MS = 2 * 3_600_000;
const DAY_MS = 86_400_000;

export async function serviceStarted(): Promise<string> {
  const now = Date.now();
  const day = (offset: number) => new Date(now + offset * DAY_MS).toISOString().slice(0, 10);
  // Dates are "YYYY-MM-DD" text: yesterday..tomorrow (UTC) covers every time zone.
  const candidates = await prisma.$queryRaw<Array<{ id: string; date: string; time: string; serviceName: string; clientId: string; salonId: string | null; salonName: string | null; timeZone: string | null }>>`
    SELECT a.id::text, a.date, a.time, a."serviceName", a.client_id::text AS "clientId",
           b.id::text AS "salonId", b."businessName" AS "salonName", p.time_zone AS "timeZone"
    FROM appointments a
    LEFT JOIN businesses b ON b.id = a.business_id
    LEFT JOIN user_preferences p ON p."userId" = a.client_id
    WHERE a.status IN ('Confirmed', 'Rescheduled') AND a."serviceStartedNotifiedAt" IS NULL
      AND a.client_id IS NOT NULL AND a.date BETWEEN ${day(-1)} AND ${day(1)}`;

  let sent = 0;
  for (const a of candidates) {
    const wall = wallClockMs(a.date, a.time);
    if (wall === null) continue;
    const zone = a.timeZone && a.timeZone !== "UTC" && isTimeZone(a.timeZone) ? a.timeZone : PLATFORM_TIME_ZONE;
    const startsAt = instantOfWallClock(wall, zone);
    if (now < startsAt || now - startsAt > RECENT_MS) continue;

    // Claimed before it's sent: never twice, even if two runs overlap.
    const claimed = await prisma.appointments.updateMany({ where: { id: a.id, serviceStartedNotifiedAt: null }, data: { serviceStartedNotifiedAt: new Date() } });
    if (!claimed.count) continue;
    notifyUser(a.clientId, {
      title: "Your Service Has Started",
      message: `Your appointment at ${a.salonName || "the salon"} for ${a.serviceName} has started.`,
      link: "/customer/appointment/booking-management",
      metadata: { appointmentId: a.id, salonId: a.salonId, salonName: a.salonName },
    });
    sent++;
  }
  return `${sent} notified of ${candidates.length} candidate(s)`;
}
