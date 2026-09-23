import { AppointmentStatus } from '../entities/appointment.entity';
import {
  computeDisplayStatus,
  extractDurationMinutes,
  parseApptDateTime,
} from './appointment-display-status';

describe('extractDurationMinutes', () => {
  it('pulls the minute count out of a "H:MM AM/PM (N min)" label', () => {
    expect(extractDurationMinutes('4:00 PM (120 min)')).toBe(120);
  });

  it('falls back to 60 when the label is missing or unparseable', () => {
    expect(extractDurationMinutes(undefined)).toBe(60);
    expect(extractDurationMinutes(null)).toBe(60);
    expect(extractDurationMinutes('garbage')).toBe(60);
  });
});

describe('computeDisplayStatus', () => {
  const base = { date: '2026-09-22', time: '2:00 PM', duration: '4:00 PM (120 min)' };

  it('shows "Ongoing" for a Confirmed appointment whose time window has started but not ended', () => {
    const now = parseApptDateTime('2026-09-22', '3:00 PM'); // 1h into a 2h booking
    expect(computeDisplayStatus({ ...base, status: AppointmentStatus.CONFIRMED }, now)).toBe(
      'Ongoing',
    );
  });

  it('shows "Ongoing" for a Rescheduled appointment too', () => {
    const now = parseApptDateTime('2026-09-22', '2:30 PM');
    expect(computeDisplayStatus({ ...base, status: AppointmentStatus.RESCHEDULED }, now)).toBe(
      'Ongoing',
    );
  });

  it('stays as the stored status before the appointment starts', () => {
    const now = parseApptDateTime('2026-09-22', '1:00 PM');
    expect(computeDisplayStatus({ ...base, status: AppointmentStatus.CONFIRMED }, now)).toBe(
      AppointmentStatus.CONFIRMED,
    );
  });

  it('stays as the stored status after the appointment window ends', () => {
    const now = parseApptDateTime('2026-09-22', '4:01 PM');
    expect(computeDisplayStatus({ ...base, status: AppointmentStatus.CONFIRMED }, now)).toBe(
      AppointmentStatus.CONFIRMED,
    );
  });

  it('never overrides a terminal status (Completed/Cancelled/No Show) even mid-window', () => {
    const now = parseApptDateTime('2026-09-22', '3:00 PM');
    expect(computeDisplayStatus({ ...base, status: AppointmentStatus.COMPLETED }, now)).toBe(
      AppointmentStatus.COMPLETED,
    );
    expect(computeDisplayStatus({ ...base, status: AppointmentStatus.CANCELLED }, now)).toBe(
      AppointmentStatus.CANCELLED,
    );
    expect(computeDisplayStatus({ ...base, status: AppointmentStatus.NO_SHOW }, now)).toBe(
      AppointmentStatus.NO_SHOW,
    );
  });
});
