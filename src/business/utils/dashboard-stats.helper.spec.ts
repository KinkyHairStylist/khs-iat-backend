import {
  resolveDashboardPeriodBounds,
  computeGrowth,
  computeDashboardMetrics,
  DashboardAppointmentRow,
} from './dashboard-stats.helper';
import { AppointmentStatus } from '../entities/appointment.entity';

describe('resolveDashboardPeriodBounds', () => {
  it('today: current is the anchor day, previous is the day before', () => {
    const bounds = resolveDashboardPeriodBounds('today', new Date(2026, 8, 28)); // Mon 2026-09-28
    expect(bounds.current).toEqual({ start: '2026-09-28', end: '2026-09-28' });
    expect(bounds.previous).toEqual({ start: '2026-09-27', end: '2026-09-27' });
  });

  it('week: Sunday-Saturday containing the anchor, previous is the 7 days before', () => {
    const bounds = resolveDashboardPeriodBounds('week', new Date(2026, 8, 28)); // Mon 2026-09-28
    expect(bounds.current).toEqual({ start: '2026-09-27', end: '2026-10-03' });
    expect(bounds.previous).toEqual({ start: '2026-09-20', end: '2026-09-26' });
  });

  it('month: the anchor calendar month, previous is the prior calendar month', () => {
    const bounds = resolveDashboardPeriodBounds('month', new Date(2026, 8, 28)); // Sep 2026
    expect(bounds.current).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(bounds.previous).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('month: rolls over the year boundary correctly', () => {
    const bounds = resolveDashboardPeriodBounds('month', new Date(2026, 0, 15)); // Jan 2026
    expect(bounds.current).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(bounds.previous).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });
});

describe('computeGrowth', () => {
  it('reports a plain percentage increase', () => {
    expect(computeGrowth(120, 100)).toEqual({ percent: 20, text: '+20%', type: 'increase' });
  });

  it('reports a plain percentage decrease', () => {
    expect(computeGrowth(80, 100)).toEqual({ percent: -20, text: '-20%', type: 'decrease' });
  });

  it('is neutral when nothing changed', () => {
    expect(computeGrowth(50, 50)).toEqual({ percent: 0, text: '0%', type: 'neutral' });
  });

  it('is neutral, not a division-by-zero error, when both periods are zero', () => {
    expect(computeGrowth(0, 0)).toEqual({ percent: 0, text: '0%', type: 'neutral' });
  });

  it('reports "New" instead of +Infinity% when there was no prior activity at all', () => {
    expect(computeGrowth(5, 0)).toEqual({ percent: 100, text: 'New', type: 'increase' });
  });
});

describe('computeDashboardMetrics', () => {
  const rows: DashboardAppointmentRow[] = [
    // current week-of-2026-09-28 (Sun 09-27 to Sat 10-03)
    { date: '2026-09-28', status: AppointmentStatus.COMPLETED, amount: 100, duration: '(60 min)', clientKey: 'client-1' },
    { date: '2026-09-29', status: AppointmentStatus.CONFIRMED, amount: 50, duration: '(30 min)', clientKey: 'client-2' },
    { date: '2026-09-29', status: AppointmentStatus.CANCELLED, amount: 999, duration: '(999 min)', clientKey: 'client-3' },
    // previous week (Sun 09-20 to Sat 09-26)
    { date: '2026-09-21', status: AppointmentStatus.COMPLETED, amount: 40, duration: '(60 min)', clientKey: 'client-1' },
  ];

  it('scopes revenue to Confirmed/Completed only, per period', () => {
    const bounds = resolveDashboardPeriodBounds('week', new Date(2026, 8, 28));
    const metrics = computeDashboardMetrics(rows, bounds);
    // 100 + 50 = 150 -- the Cancelled row's 999 must not count.
    expect(metrics.revenue.current).toBe(150);
    expect(metrics.revenue.previous).toBe(40);
  });

  it('counts every appointment (any status) toward bookings', () => {
    const bounds = resolveDashboardPeriodBounds('week', new Date(2026, 8, 28));
    const metrics = computeDashboardMetrics(rows, bounds);
    expect(metrics.bookings.current).toBe(3);
    expect(metrics.bookings.previous).toBe(1);
  });

  it('counts distinct clients, not appointments', () => {
    const bounds = resolveDashboardPeriodBounds('week', new Date(2026, 8, 28));
    const metrics = computeDashboardMetrics(rows, bounds);
    expect(metrics.activeClients.current).toBe(3); // client-1, client-2, client-3
    expect(metrics.activeClients.previous).toBe(1);
  });

  it('averages the parsed duration in minutes', () => {
    const bounds = resolveDashboardPeriodBounds('week', new Date(2026, 8, 28));
    const metrics = computeDashboardMetrics(rows, bounds);
    // (60 + 30 + 999) / 3 = 363
    expect(metrics.averageServiceTimeMinutes.current).toBe(363);
  });
});
