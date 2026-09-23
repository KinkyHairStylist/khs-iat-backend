import { AppointmentStatus } from '../entities/appointment.entity';
import { groupAppointmentsByClient, minutesOfDay, summarizeClientAppointments } from './client-stats';

const appt = (id: string, status: AppointmentStatus, date: string, time = '10:00 AM', amount = 0) => ({ id, status, date, time, amount });
const TODAY = '2026-09-21';

describe('reading the time of an appointment', () => {
  it('understands 12-hour and 24-hour times', () => {
    expect(minutesOfDay('10:00 AM')).toBe(600);
    expect(minutesOfDay('2:30 pm')).toBe(14 * 60 + 30);
    expect(minutesOfDay('12:15 AM')).toBe(15);
    expect(minutesOfDay('12:15 PM')).toBe(12 * 60 + 15);
    expect(minutesOfDay('09:00')).toBe(540);
    expect(minutesOfDay('00:30')).toBe(30);
  });

  it('puts an unreadable time last', () => {
    expect(minutesOfDay(null)).toBeGreaterThan(minutesOfDay('11:59 PM'));
    expect(minutesOfDay('later')).toBeGreaterThan(minutesOfDay('11:59 PM'));
  });
});

describe('what a client card shows', () => {
  it('counts only completed appointments as visits and adds up what they were worth', () => {
    const s = summarizeClientAppointments(
      [
        appt('1', AppointmentStatus.COMPLETED, '2026-08-01', '10:00 AM', 45.5),
        appt('2', AppointmentStatus.COMPLETED, '2026-08-10', '10:00 AM', 30.25),
        appt('3', AppointmentStatus.CANCELLED, '2026-08-15', '10:00 AM', 99),
        appt('4', AppointmentStatus.CONFIRMED, '2026-10-01', '10:00 AM', 60),
      ],
      TODAY,
    );
    expect(s.visits).toBe(2);
    expect(s.lifetimeValue).toBe(75.75);
  });

  it('does not drift on decimals', () => {
    const s = summarizeClientAppointments([0.1, 0.2].map((n, i) => appt(String(i), AppointmentStatus.COMPLETED, '2026-08-01', '10:00 AM', n)), TODAY);
    expect(s.lifetimeValue).toBe(0.3);
  });

  it('picks the soonest upcoming appointment, by date and then by time', () => {
    const s = summarizeClientAppointments(
      [
        appt('1', AppointmentStatus.CONFIRMED, '2026-09-25', '9:00 AM'),
        appt('2', AppointmentStatus.PENDING, '2026-09-23', '2:00 PM'),
        appt('3', AppointmentStatus.RESCHEDULED, '2026-09-23', '10:00 AM'),
        appt('4', AppointmentStatus.CANCELLED, '2026-09-22', '8:00 AM'),
        appt('5', AppointmentStatus.CONFIRMED, '2026-09-10', '8:00 AM'),
      ],
      TODAY,
    );
    expect(s.nextAppointment).toEqual({ date: '2026-09-23', time: '10:00 AM' });
  });

  it("still treats today's appointment as upcoming", () => {
    const s = summarizeClientAppointments([appt('1', AppointmentStatus.CONFIRMED, TODAY, '8:00 AM')], TODAY);
    expect(s.nextAppointment?.date).toBe(TODAY);
  });

  it('has nothing to show for a client with no appointments', () => {
    expect(summarizeClientAppointments([], TODAY)).toEqual({
      visits: 0,
      lifetimeValue: 0,
      nextAppointment: null,
      noShows: 0,
    });
  });

  it('counts no-show appointments separately from cancellations and visits', () => {
    const s = summarizeClientAppointments(
      [
        appt('1', AppointmentStatus.NO_SHOW, '2026-08-01'),
        appt('2', AppointmentStatus.NO_SHOW, '2026-08-10'),
        appt('3', AppointmentStatus.CANCELLED, '2026-08-15'),
        appt('4', AppointmentStatus.COMPLETED, '2026-08-20'),
      ],
      TODAY,
    );
    expect(s.noShows).toBe(2);
    expect(s.visits).toBe(1);
  });
});

describe('matching appointments to clients', () => {
  const clients = [
    { id: 'c1', email: 'Ada@Example.com' },
    { id: 'c2', email: 'bo@example.com' },
    { id: 'c3', email: null },
  ];
  const a = (id: string, extra: object) => ({ ...appt(id, AppointmentStatus.COMPLETED, '2026-08-01'), ...extra });

  it('matches by the client record or by the same email, ignoring case', () => {
    const g = groupAppointmentsByClient(clients, [
      a('1', { businessClientId: 'c2' }),
      a('2', { clientEmail: 'ada@example.com' }),
      a('3', { clientEmail: 'unknown@example.com' }),
    ]);
    expect(g.get('c2')?.map((x) => x.id)).toEqual(['1']);
    expect(g.get('c1')?.map((x) => x.id)).toEqual(['2']);
    expect(g.get('c3')).toBeUndefined();
  });

  it('counts an appointment once even when both links point at the same client', () => {
    const g = groupAppointmentsByClient(clients, [a('1', { businessClientId: 'c1', clientEmail: 'ada@example.com' })]);
    expect(g.get('c1')).toHaveLength(1);
  });
});
