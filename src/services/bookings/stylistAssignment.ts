import { parseClockToMinutes } from "./bookingRules";
import { parseDurationToMinutes } from "./bookingRulesCheck";

// Who does a new booking. Ported from Kinky-Hair-Stylist-BE-Redesign's
// stylist-assignment: only ever one stylist per booking.

export interface Stylist {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

/** An appointment already on the day, and who it's with. */
export interface DayAppointment {
  time: string;
  duration: string | null;
  staffIds: string[];
}

/** Time the salon blocked off. teamMember is a full name, or empty / "All" for everyone. */
export interface DayBlock {
  startTime: string;
  endTime: string;
  teamMember: string | null;
}

export interface Slot {
  startMinutes: number;
  durationMinutes: number;
  bufferMinutes: number;
}

export type Assignment = { ok: true; stylist: Stylist | null } | { ok: false; reason: "not-eligible" | "busy" };

const EVERYONE = new Set(["", "all", "all team members", "everyone"]);
const nameOf = (s: Stylist) => `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim().toLowerCase();

/**
 * Who can do these services: the active team, narrowed by every service that
 * has people assigned to it. A service nobody is assigned to can be done by anyone.
 */
export function eligibleStylists(activeStaff: Stylist[], assignedPerService: string[][]): Stylist[] {
  let pool = activeStaff;
  for (const assigned of assignedPerService) {
    if (assigned.length === 0) continue;
    const allowed = new Set(assigned);
    pool = pool.filter((s) => allowed.has(s.id));
  }
  return pool;
}

/** Free when none of their appointments overlap the slot (plus buffer) and nothing is blocked off for them or everyone. */
export function isStylistFree(stylist: Stylist, slot: Slot, appointments: DayAppointment[], blocks: DayBlock[]): boolean {
  const slotEnd = slot.startMinutes + slot.durationMinutes;

  for (const a of appointments) {
    if (!a.staffIds.includes(stylist.id)) continue;
    const start = parseClockToMinutes(a.time);
    if (start === null) continue;
    const end = start + parseDurationToMinutes(a.duration);
    if (slot.startMinutes < end + slot.bufferMinutes && slotEnd + slot.bufferMinutes > start) return false;
  }

  for (const b of blocks) {
    const start = parseClockToMinutes(b.startTime);
    const end = parseClockToMinutes(b.endTime);
    if (start === null || end === null || !(slot.startMinutes < end && slotEnd > start)) continue;
    const who = (b.teamMember ?? "").trim().toLowerCase();
    if (EVERYONE.has(who) || who === nameOf(stylist)) return false;
  }

  return true;
}

/**
 * Picks who does the booking. A stylist the customer asked for must be able to
 * do the services and be free (unless the salon allows double bookings). With
 * "any stylist", the free stylist with the fewest appointments that day; a salon
 * with nobody to assign leaves the booking unassigned.
 */
export function chooseStylist(input: {
  requestedId?: string | null;
  candidates: Stylist[];
  slot: Slot;
  appointments: DayAppointment[];
  blocks: DayBlock[];
  allowDoubleBookings: boolean;
}): Assignment {
  const { requestedId, candidates, slot, appointments, blocks, allowDoubleBookings } = input;
  const load = (s: Stylist) => appointments.filter((a) => a.staffIds.includes(s.id)).length;

  if (requestedId) {
    const wanted = candidates.find((c) => c.id === requestedId);
    if (!wanted) return { ok: false, reason: "not-eligible" };
    if (!allowDoubleBookings && !isStylistFree(wanted, slot, appointments, blocks)) return { ok: false, reason: "busy" };
    return { ok: true, stylist: wanted };
  }

  if (candidates.length === 0) return { ok: true, stylist: null };
  const free = candidates.filter((c) => isStylistFree(c, slot, appointments, blocks));
  const pool = free.length > 0 ? free : allowDoubleBookings ? candidates : [];
  if (pool.length === 0) return { ok: true, stylist: null };
  return { ok: true, stylist: pool.reduce((best, s) => (load(s) < load(best) ? s : best)) };
}
