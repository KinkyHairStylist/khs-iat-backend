import { parseClockToMinutes, type BookingRules } from "./bookingRules";

// Whether a requested booking keeps to the salon's rules — the server-side
// check behind the booking calendar, ported from Kinky-Hair-Stylist-BE-Redesign.
// Appointment dates and times are stored as wall-clock text ("2026-09-25",
// "2:00 PM"), so everything here is wall-clock time: "now" is shifted into the
// customer's timezone rather than trusting the server's.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface ExistingSlot {
  date: string;
  time: string;
  duration?: string | null;
}

/** "1 hr 30 mins" / "45 min" / "60" → minutes. Unreadable counts as 30, as the booking calendar does. */
export function parseDurationToMinutes(value?: string | null): number {
  if (!value) return 30;
  const str = value.toLowerCase();
  let total = 0;
  const hours = str.match(/(\d+)\s*(?:h|hr|hour)/);
  if (hours) total += parseInt(hours[1], 10) * 60;
  const mins = str.match(/(\d+)\s*(?:m|min|minute)/);
  if (mins) total += parseInt(mins[1], 10);
  if (total === 0) {
    const bare = parseInt(str.replace(/[^0-9]/g, ""), 10);
    if (bare > 0) total = bare;
  }
  return total > 0 ? total : 30;
}

/** Wall-clock milliseconds (as if UTC) for a stored date and time, or null. */
export function wallClockMs(date: string, time: string): number | null {
  const d = String(date ?? "").slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const minutes = parseClockToMinutes(time);
  if (!d || minutes === null) return null;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])) + minutes * MINUTE_MS;
}

/**
 * "Now" as wall-clock ms in the customer's timezone. `offsetMinutes` is the
 * browser's Date.getTimezoneOffset() (UTC minus local); without one, the server's.
 */
export function wallClockNowMs(offsetMinutes?: number | null, nowMs = Date.now()): number {
  const offset =
    typeof offsetMinutes === "number" && Number.isFinite(offsetMinutes)
      ? Math.max(-14 * 60, Math.min(14 * 60, offsetMinutes))
      : new Date(nowMs).getTimezoneOffset();
  return nowMs - offset * MINUTE_MS;
}

function formatNotice(minutes: number): string {
  if (minutes >= DAY_MS / MINUTE_MS && minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${minutes} minutes`;
}

/** Minutes since midnight → "2:30 PM", the stored appointment format. */
export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  return `${h24 % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

/**
 * The reason a booking breaks the salon's rules, or null when it's fine.
 * `existing` is the salon's other active appointments that day; only used
 * when double bookings are off.
 */
export function checkBookingAgainstRules(input: {
  rules: BookingRules;
  date: string;
  time: string;
  durationMinutes: number;
  nowWallClockMs: number;
  existing?: ExistingSlot[];
}): string | null {
  const { rules, date, time, durationMinutes, nowWallClockMs } = input;
  const start = wallClockMs(date, time);
  if (start === null) return "Please choose a valid date and time.";

  if (start - nowWallClockMs < rules.minimumLeadMinutes * MINUTE_MS) {
    return `This salon needs at least ${formatNotice(rules.minimumLeadMinutes)} notice for a booking. Please choose a later time.`;
  }

  const startDay = Math.floor(start / DAY_MS);
  const today = Math.floor(nowWallClockMs / DAY_MS);
  if (startDay - today > rules.maximumAdvanceDays) {
    const days = rules.maximumAdvanceDays;
    return `This salon takes bookings up to ${days} ${days === 1 ? "day" : "days"} ahead. Please choose an earlier date.`;
  }

  if (rules.sameDayCutoffMinutes !== null && startDay === today) {
    const nowMinutes = Math.floor((nowWallClockMs - today * DAY_MS) / MINUTE_MS);
    if (nowMinutes > rules.sameDayCutoffMinutes) {
      return `Same-day bookings for this salon close at ${formatClock(rules.sameDayCutoffMinutes)}. Please choose another day.`;
    }
  }

  if (!rules.allowDoubleBookings) {
    const startMin = Math.floor((start - startDay * DAY_MS) / MINUTE_MS);
    const endMin = startMin + durationMinutes;
    for (const other of input.existing ?? []) {
      if (String(other.date).slice(0, 10) !== String(date).slice(0, 10)) continue;
      const otherStart = parseClockToMinutes(other.time);
      if (otherStart === null) continue;
      const otherEnd = otherStart + parseDurationToMinutes(other.duration);
      if (startMin < otherEnd + rules.bufferMinutes && endMin + rules.bufferMinutes > otherStart) {
        return "That time is no longer available. Please choose another time.";
      }
    }
  }

  return null;
}
