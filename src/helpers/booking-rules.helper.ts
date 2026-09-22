import { Business } from 'src/business/entities/business.entity';

// A salon's scheduling rules as the booking flow enforces them.
// Appointment date/time are stored as naive wall-clock strings ("2026-09-25",
// "2:00 PM"), so every comparison below is done in wall-clock time: "now" is
// shifted into the client's timezone (see naiveNowMs) instead of trusting the
// server's own timezone.
export interface ResolvedBookingRules {
  minimumLeadMinutes: number;
  bufferMinutes: number;
  maximumAdvanceDays: number;
  sameDayCutoffMinutes: number | null;
  allowDoubleBookings: boolean;
}

export const DEFAULT_BOOKING_RULES: ResolvedBookingRules = {
  minimumLeadMinutes: 24 * 60,
  bufferMinutes: 0,
  maximumAdvanceDays: 90,
  sameDayCutoffMinutes: null,
  allowDoubleBookings: false,
};

export interface ExistingSlot {
  date: string;
  time: string;
  duration?: string | null;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// "15:00", "15:00:00", "3:00 PM", "03:00 pm" -> minutes since midnight.
export function parseClockToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// "1 hr 30 mins" / "45 min" / "2 hours" -> minutes. Matches the parser the
// customer booking modal uses to size a slot; unparseable counts as 30.
export function parseDurationToMinutes(value?: string | null): number {
  if (!value) return 30;
  const str = value.toLowerCase();
  let total = 0;
  const hourMatch = str.match(/(\d+)\s*(?:h|hr|hour)/);
  if (hourMatch) total += parseInt(hourMatch[1], 10) * 60;
  const minMatch = str.match(/(\d+)\s*(?:m|min|minute)/);
  if (minMatch) total += parseInt(minMatch[1], 10);
  if (total === 0) {
    const numOnly = parseInt(str.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(numOnly) && numOnly > 0) total = numOnly;
  }
  return total > 0 ? total : 30;
}

// Wall-clock milliseconds (as if UTC) for a stored date + time, or null.
export function wallClockMs(date: string, time: string): number | null {
  const d = String(date ?? '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const minutes = parseClockToMinutes(time);
  if (!d || minutes === null) return null;
  return (
    Date.UTC(parseInt(d[1], 10), parseInt(d[2], 10) - 1, parseInt(d[3], 10)) +
    minutes * MINUTE_MS
  );
}

// "Now" as wall-clock ms in the client's timezone. offsetMinutes is the
// browser's Date.getTimezoneOffset() (UTC minus local); when the client did
// not send one, fall back to the server's own offset.
export function wallClockNowMs(offsetMinutes?: number | null, nowMs = Date.now()): number {
  const offset =
    typeof offsetMinutes === 'number' && Number.isFinite(offsetMinutes)
      ? Math.max(-14 * 60, Math.min(14 * 60, offsetMinutes))
      : new Date(nowMs).getTimezoneOffset();
  return nowMs - offset * MINUTE_MS;
}

// Lead time and buffer come from the booking policies row the sign-up wizard
// and Settings > Booking Rules both write; the dashboard-only values are the
// fallback for salons without one.
export function resolveBookingRules(
  business?: Pick<Business, 'bookingPolicies' | 'ownerSettings'> | null,
): ResolvedBookingRules {
  const policies = business?.bookingPolicies;
  const rules = business?.ownerSettings?.bookingRules;
  const d = DEFAULT_BOOKING_RULES;

  const leadFromRules =
    rules?.minimumLeadTimeHours != null ? Number(rules.minimumLeadTimeHours) * 60 : null;

  return {
    minimumLeadMinutes: policies?.minimumLeadTime ?? leadFromRules ?? d.minimumLeadMinutes,
    bufferMinutes:
      policies?.bufferTime ?? rules?.bufferTimeBetweenAppointmentsMinutes ?? d.bufferMinutes,
    maximumAdvanceDays: rules?.maximumAdvanceBookingDays ?? d.maximumAdvanceDays,
    sameDayCutoffMinutes: parseClockToMinutes(rules?.sameDayBookingCutoff),
    allowDoubleBookings: rules?.allowDoubleBookings === true,
  };
}

function formatDuration(minutes: number): string {
  if (minutes % (24 * 60) === 0 && minutes >= 24 * 60) {
    const days = minutes / (24 * 60);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${minutes} minutes`;
}

function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, '0');
  return `${h24 % 12 || 12}:${mm} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

// Returns the reason a booking breaks the salon's rules, or null when it is
// fine. `existing` is the salon's other active appointments on that date;
// only consulted when double bookings are off.
export function checkBookingAgainstRules(input: {
  rules: ResolvedBookingRules;
  date: string;
  time: string;
  durationMinutes: number;
  nowWallClockMs: number;
  existing?: ExistingSlot[];
}): string | null {
  const { rules, date, time, durationMinutes, nowWallClockMs } = input;
  const start = wallClockMs(date, time);
  if (start === null) return 'Please choose a valid date and time';

  if (start - nowWallClockMs < rules.minimumLeadMinutes * MINUTE_MS) {
    return `This salon needs at least ${formatDuration(rules.minimumLeadMinutes)} notice for a booking. Please choose a later time.`;
  }

  const startDay = Math.floor(start / DAY_MS);
  const today = Math.floor(nowWallClockMs / DAY_MS);
  if (startDay - today > rules.maximumAdvanceDays) {
    return `This salon takes bookings up to ${rules.maximumAdvanceDays} ${rules.maximumAdvanceDays === 1 ? 'day' : 'days'} ahead. Please choose an earlier date.`;
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
    const buffer = rules.bufferMinutes;
    for (const other of input.existing ?? []) {
      if (String(other.date).slice(0, 10) !== String(date).slice(0, 10)) continue;
      const otherStart = parseClockToMinutes(other.time);
      if (otherStart === null) continue;
      const otherEnd = otherStart + parseDurationToMinutes(other.duration);
      if (startMin < otherEnd + buffer && endMin + buffer > otherStart) {
        return 'That time is no longer available. Please choose another time.';
      }
    }
  }

  return null;
}
