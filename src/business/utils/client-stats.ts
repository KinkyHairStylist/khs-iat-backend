import { AppointmentStatus } from '../entities/appointment.entity';

export interface ClientAppointmentRow {
  id: string;
  date: string;
  time?: string | null;
  status: AppointmentStatus | string;
  amount?: number | null;
}

export interface ClientStats {
  visits: number;
  lifetimeValue: number;
  nextAppointment: { date: string; time: string | null } | null;
  noShows: number;
}

// "10:00 AM", "2:30 pm" and "14:30" all turn into minutes past midnight, so times on the same day
// can be put in order. Anything unreadable sorts last.
export function minutesOfDay(time?: string | null): number {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap]m)?\s*$/i.exec(time ?? '');
  if (!m) return Number.MAX_SAFE_INTEGER;
  let hours = Number(m[1]);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours * 60 + Number(m[2]);
}

const UPCOMING = new Set<string>([
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.PENDING,
  AppointmentStatus.RESCHEDULED,
]);

// What a merchant wants to see on a client card: how many visits they have actually had, what those
// visits were worth, and when they are next due in. A visit is a completed appointment. An
// appointment today still counts as upcoming, so a slightly different clock or time zone cannot turn
// today's booking into one that has already gone.
export function summarizeClientAppointments(
  appointments: ClientAppointmentRow[],
  today: string,
): ClientStats {
  let visits = 0;
  let cents = 0;
  let noShows = 0;
  let next: ClientAppointmentRow | null = null;

  for (const a of appointments) {
    if (a.status === AppointmentStatus.COMPLETED) {
      visits += 1;
      cents += Math.round((Number(a.amount) || 0) * 100);
    } else if (a.status === AppointmentStatus.NO_SHOW) {
      noShows += 1;
    } else if (UPCOMING.has(a.status as string) && a.date >= today) {
      const sooner =
        !next ||
        a.date < next.date ||
        (a.date === next.date && minutesOfDay(a.time) < minutesOfDay(next.time));
      if (sooner) next = a;
    }
  }

  return {
    visits,
    lifetimeValue: cents / 100,
    nextAppointment: next ? { date: next.date, time: next.time ?? null } : null,
    noShows,
  };
}

// Appointments belong to a client record in one of two ways: it was booked against that record, or
// the person booked through KHS with the same email. An appointment is only ever counted once.
export function groupAppointmentsByClient<T extends ClientAppointmentRow>(
  clients: { id: string; email?: string | null }[],
  appointments: (T & { businessClientId?: string | null; clientEmail?: string | null })[],
): Map<string, T[]> {
  const byEmail = new Map<string, string[]>();
  for (const c of clients) {
    const email = c.email?.trim().toLowerCase();
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), c.id]);
  }

  const grouped = new Map<string, Map<string, T>>();
  const add = (clientId: string, a: T) => {
    if (!grouped.has(clientId)) grouped.set(clientId, new Map());
    grouped.get(clientId)!.set(a.id, a);
  };

  for (const a of appointments) {
    if (a.businessClientId) add(a.businessClientId, a);
    const email = a.clientEmail?.trim().toLowerCase();
    if (email) for (const id of byEmail.get(email) ?? []) add(id, a);
  }

  const result = new Map<string, T[]>();
  for (const [id, rows] of grouped) result.set(id, [...rows.values()]);
  return result;
}
