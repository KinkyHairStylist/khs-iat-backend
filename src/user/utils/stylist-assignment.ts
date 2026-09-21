import { parseClockToMinutes, parseDurationToMinutes } from 'src/helpers/booking-rules.helper';

export interface Stylist {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  isActive?: boolean;
}

export interface ServiceWithStaff {
  assignedStaff?: Stylist[] | null;
}

// An existing appointment on the day, and who it is with.
export interface DayAppointment {
  time: string;
  duration?: string | null;
  staffIds: string[];
}

// Time the salon blocked off. teamMember is a name, or empty / "All" for everyone.
export interface DayBlock {
  startTime: string;
  endTime: string;
  teamMember?: string | null;
}

export interface Slot {
  startMinutes: number;
  durationMinutes: number;
  bufferMinutes: number;
}

export type Assignment =
  | { ok: true; stylist: Stylist | null }
  | { ok: false; reason: 'not-eligible' | 'busy' };

const EVERYONE = new Set(['all', 'all team members', 'everyone']);

const nameOf = (s: Stylist) => `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim().toLowerCase();

// Who can do these services: active staff, narrowed by each service that has people assigned to it. A
// service nobody is assigned to can be done by anyone on the team.
export function eligibleStylists(activeStaff: Stylist[], services: ServiceWithStaff[]): Stylist[] {
  let pool = activeStaff.filter((s) => s.isActive !== false);
  for (const service of services) {
    const assigned = service.assignedStaff ?? [];
    if (assigned.length === 0) continue;
    const allowed = new Set(assigned.filter((s) => s.isActive !== false).map((s) => s.id));
    pool = pool.filter((s) => allowed.has(s.id));
  }
  return pool;
}

// Free when none of their appointments overlap the slot (with the salon's buffer) and nothing is blocked off
// for them or for everyone.
export function isStylistFree(
  stylist: Stylist,
  slot: Slot,
  appointments: DayAppointment[],
  blocks: DayBlock[],
): boolean {
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
    if (start === null || end === null) continue;
    if (!(slot.startMinutes < end && slotEnd > start)) continue;
    const who = (b.teamMember ?? '').trim().toLowerCase();
    if (!who || EVERYONE.has(who) || who === nameOf(stylist)) return false;
  }

  return true;
}

// Picks who does the booking.
//  - A stylist the customer asked for has to be able to do the services, and be free (unless the salon allows
//    double bookings).
//  - With "any stylist", one free stylist who can do them is picked, whoever has the fewest appointments that
//    day. A salon with nobody to assign leaves the booking unassigned, as before.
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
    if (!wanted) return { ok: false, reason: 'not-eligible' };
    if (!allowDoubleBookings && !isStylistFree(wanted, slot, appointments, blocks)) {
      return { ok: false, reason: 'busy' };
    }
    return { ok: true, stylist: wanted };
  }

  if (candidates.length === 0) return { ok: true, stylist: null };

  const free = candidates.filter((c) => isStylistFree(c, slot, appointments, blocks));
  const pool = free.length > 0 ? free : allowDoubleBookings ? candidates : [];
  if (pool.length === 0) return { ok: true, stylist: null };

  return { ok: true, stylist: pool.reduce((best, s) => (load(s) < load(best) ? s : best)) };
}
