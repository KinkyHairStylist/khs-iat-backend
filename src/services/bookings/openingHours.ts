import { parseClockToMinutes } from "./bookingRules";

// Opening hours and salon-wide blocked time, as checked on the server. The
// customer calendar only offered open times, but nothing stopped a request
// for a closed day or a time running past closing.

export interface OpeningDay {
  day: string;
  isOpen: boolean;
  startTime: string;
  endTime: string;
}

export interface TimeBlock {
  startTime: string;
  endTime: string;
  teamMember: string | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EVERYONE = new Set(["", "all", "all team members", "everyone"]);

/** "2026-10-21" → "Wednesday" (the date's own weekday, whatever the server's timezone). */
export function weekdayOf(date: string): string | null {
  const m = String(date).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
}

/** The salon's open window that day in minutes, or null when it's closed (or has no hours set for it). */
export function openWindow(hours: OpeningDay[], date: string): { open: number; close: number } | null {
  const day = hours.find((h) => h.day === weekdayOf(date));
  if (!day?.isOpen) return null;
  const open = parseClockToMinutes(day.startTime);
  const close = parseClockToMinutes(day.endTime);
  if (open === null || close === null || close <= open) return null;
  return { open, close };
}

/** Why the salon can't take a booking then (closed, or the service runs past closing), or null. */
export function openingHoursProblem(hours: OpeningDay[], date: string, startMinutes: number, durationMinutes: number): string | null {
  // A salon that never set any hours isn't held to them (older salons).
  if (hours.length === 0) return null;
  const window = openWindow(hours, date);
  if (!window) return `The salon is closed on ${weekdayOf(date) ?? "that day"}s. Please choose another day.`;
  if (startMinutes < window.open || startMinutes + durationMinutes > window.close) {
    return "That time is outside the salon's opening hours. Please choose another time.";
  }
  return null;
}

/** True when time blocked off for the whole salon overlaps the slot. */
export function salonBlocked(blocks: TimeBlock[], startMinutes: number, durationMinutes: number): boolean {
  const end = startMinutes + durationMinutes;
  return blocks.some((b) => {
    if (!EVERYONE.has((b.teamMember ?? "").trim().toLowerCase())) return false;
    const from = parseClockToMinutes(b.startTime);
    const to = parseClockToMinutes(b.endTime);
    return from !== null && to !== null && startMinutes < to && end > from;
  });
}
