import { AppointmentStatus } from '../entities/appointment.entity';
import { summarizeStaffAppointments, weekBounds } from './staff-stats';

// Monday 21 Sept 2026: the week runs Sunday 20th to Saturday 26th.
const NOW = new Date(2026, 8, 21, 12, 0, 0);
const WEEK = weekBounds(NOW);
const row = (status: AppointmentStatus, date: string, amount = 0, time = '10:00 AM', serviceName = 'Braids') => ({ status, date, amount, time, serviceName });

describe('the week', () => {
  it('runs Sunday to Saturday around today', () => {
    expect(WEEK).toEqual({ start: '2026-09-20', end: '2026-09-26', today: '2026-09-21' });
  });

  it('starts on the day itself when today is a Sunday', () => {
    expect(weekBounds(new Date(2026, 8, 20)).start).toBe('2026-09-20');
  });
});

describe("a team member's numbers", () => {
  it('counts this week\'s confirmed, rescheduled and completed bookings, not pending or cancelled ones', () => {
    const s = summarizeStaffAppointments(
      [
        row(AppointmentStatus.CONFIRMED, '2026-09-22'),
        row(AppointmentStatus.RESCHEDULED, '2026-09-23'),
        row(AppointmentStatus.COMPLETED, '2026-09-20', 50),
        row(AppointmentStatus.PENDING, '2026-09-22'),
        row(AppointmentStatus.CANCELLED, '2026-09-22'),
        row(AppointmentStatus.CONFIRMED, '2026-09-30'),
        row(AppointmentStatus.CONFIRMED, '2026-09-19'),
      ],
      WEEK,
    );
    expect(s.bookingsThisWeek).toBe(3);
  });

  it('adds up only what completed bookings earned this week', () => {
    const s = summarizeStaffAppointments(
      [
        row(AppointmentStatus.COMPLETED, '2026-09-20', 45.5),
        row(AppointmentStatus.COMPLETED, '2026-09-21', 30.25),
        row(AppointmentStatus.COMPLETED, '2026-09-10', 999),
        row(AppointmentStatus.CONFIRMED, '2026-09-22', 80),
      ],
      WEEK,
    );
    expect(s.earningsThisWeek).toBe(75.75);
  });

  it('does not drift on decimals', () => {
    const s = summarizeStaffAppointments([0.1, 0.2].map((n) => row(AppointmentStatus.COMPLETED, '2026-09-21', n)), WEEK);
    expect(s.earningsThisWeek).toBe(0.3);
  });

  it('shows the soonest confirmed or rescheduled booking from today on', () => {
    const s = summarizeStaffAppointments(
      [
        row(AppointmentStatus.CONFIRMED, '2026-10-02', 0, '9:00 AM', 'Late'),
        row(AppointmentStatus.CONFIRMED, '2026-09-24', 0, '2:00 PM', 'Later'),
        row(AppointmentStatus.RESCHEDULED, '2026-09-24', 0, '10:00 AM', 'First'),
        row(AppointmentStatus.PENDING, '2026-09-21', 0, '8:00 AM', 'Unpaid'),
        row(AppointmentStatus.CONFIRMED, '2026-09-01', 0, '8:00 AM', 'Past'),
      ],
      WEEK,
    );
    expect(s.nextAppointment).toEqual({ time: '10:00 AM', type: 'First', date: '2026-09-24' });
  });

  it('has nothing to show for someone with no bookings', () => {
    expect(summarizeStaffAppointments([], WEEK)).toEqual({ bookingsThisWeek: 0, earningsThisWeek: 0, nextAppointment: null });
  });
});
