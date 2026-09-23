import { AppointmentStatus } from '../entities/appointment.entity';

// This codebase stores appointment date/time as two separate display
// strings — date "2024-01-15", time "2:00 PM" (12-hour) — so naively
// building `new Date(`${date}T${time}`)` silently produces Invalid Date.
// Mirrors the equivalent parsing in booking.service.ts's
// parseAppointmentDateTime.
export function parseApptDateTime(date: string, time: string): Date {
  const [timePart, meridiem] = (time || '').split(' ');
  const [hoursRaw, minutes] = (timePart || '0:0').split(':').map(Number);
  let hours = hoursRaw || 0;
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  else if (meridiem === 'AM' && hours === 12) hours = 0;

  const dt = new Date(date);
  dt.setHours(hours, minutes || 0, 0, 0);
  return dt;
}

const DEFAULT_DURATION_MINUTES = 60;

// duration is a free-text label like "4:00 PM (120 min)" — pull the
// number out of it rather than trust the whole string; fall back to a
// sane default if it's ever missing or unparseable.
export function extractDurationMinutes(duration?: string | null): number {
  const match = /\((\d+)\s*min\)/i.exec(duration ?? '');
  return match ? Number(match[1]) : DEFAULT_DURATION_MINUTES;
}

export interface DisplayStatusInput {
  status: AppointmentStatus | string;
  date: string;
  time: string;
  duration?: string | null;
}

// "Ongoing" is never stored — it's a Confirmed/Rescheduled appointment
// whose time window has started but not yet ended, derived live at read
// time. Keeping it derived (rather than a real persisted status) means
// nothing that already reads/compares the stored `status` column
// (stats, completion, cancellation, the enum's own DB type) needs to
// change to support it.
export function computeDisplayStatus(
  appointment: DisplayStatusInput,
  now: Date = new Date(),
): string {
  const isInProgressEligible =
    appointment.status === AppointmentStatus.CONFIRMED ||
    appointment.status === AppointmentStatus.RESCHEDULED;

  if (!isInProgressEligible) return appointment.status;

  const start = parseApptDateTime(appointment.date, appointment.time);
  if (isNaN(start.getTime())) return appointment.status;

  const end = new Date(
    start.getTime() + extractDurationMinutes(appointment.duration) * 60_000,
  );

  return now >= start && now <= end ? 'Ongoing' : appointment.status;
}
