import { AppointmentStatus } from '../entities/appointment.entity';
import { minutesOfDay } from './client-stats';

export interface StaffAppointmentRow {
  date: string;
  time?: string | null;
  status: AppointmentStatus | string;
  amount?: number | null;
  serviceName?: string | null;
}

export interface StaffStats {
  bookingsThisWeek: number;
  earningsThisWeek: number;
  nextAppointment: { time: string | null; type: string | null; date: string } | null;
}

export interface WeekBounds {
  start: string; // Sunday, YYYY-MM-DD
  end: string; // Saturday
  today: string;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The week the merchant is looking at: Sunday to Saturday around today (the week the commission figure uses).
export function weekBounds(now: Date = new Date()): WeekBounds {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: iso(start), end: iso(end), today: iso(now) };
}

const COUNTS = new Set<string>([
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.COMPLETED,
]);
const UPCOMING = new Set<string>([AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED]);

// What a team member's card shows: how many bookings they have this week, what the completed ones earned, and
// who they see next. An unpaid, still-pending booking is not counted or shown: it may never happen.
export function summarizeStaffAppointments(rows: StaffAppointmentRow[], week: WeekBounds): StaffStats {
  let bookings = 0;
  let cents = 0;
  let next: StaffAppointmentRow | null = null;

  for (const r of rows) {
    const inWeek = r.date >= week.start && r.date <= week.end;
    if (inWeek && COUNTS.has(r.status as string)) bookings += 1;
    if (inWeek && r.status === AppointmentStatus.COMPLETED) cents += Math.round((Number(r.amount) || 0) * 100);

    if (UPCOMING.has(r.status as string) && r.date >= week.today) {
      const sooner =
        !next || r.date < next.date || (r.date === next.date && minutesOfDay(r.time) < minutesOfDay(next.time));
      if (sooner) next = r;
    }
  }

  return {
    bookingsThisWeek: bookings,
    earningsThisWeek: cents / 100,
    nextAppointment: next ? { time: next.time ?? null, type: next.serviceName ?? null, date: next.date } : null,
  };
}
