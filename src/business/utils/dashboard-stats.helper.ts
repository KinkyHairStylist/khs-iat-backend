import { AppointmentStatus } from '../entities/appointment.entity';
import { extractDurationMinutes } from './appointment-display-status';

export type DashboardPeriod = 'today' | 'week' | 'month';

export interface PeriodRange {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

export interface DashboardPeriodBounds {
  current: PeriodRange;
  previous: PeriodRange;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Anchored on the given date (defaults to "now" server time) rather than a
// fixed calendar boundary, so "today"/"week"/"month" always mean the period
// containing that date, and "previous" is the immediately preceding period
// of the same length — matching how the merchant reads "vs yesterday" /
// "vs prior week" / "vs last month" on the dashboard cards.
export function resolveDashboardPeriodBounds(
  period: DashboardPeriod,
  anchorDate: Date = new Date(),
): DashboardPeriodBounds {
  if (period === 'today') {
    const yesterday = new Date(anchorDate);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      current: { start: iso(anchorDate), end: iso(anchorDate) },
      previous: { start: iso(yesterday), end: iso(yesterday) },
    };
  }

  if (period === 'week') {
    // Sunday-to-Saturday, matching weekBounds() in staff-stats.ts (the same
    // "this week" a staff card's earnings/bookings already use).
    const start = new Date(
      anchorDate.getFullYear(),
      anchorDate.getMonth(),
      anchorDate.getDate() - anchorDate.getDay(),
    );
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
    const prevEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
    return {
      current: { start: iso(start), end: iso(end) },
      previous: { start: iso(prevStart), end: iso(prevEnd) },
    };
  }

  // month
  const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const prevStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1);
  const prevEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 0);
  return {
    current: { start: iso(start), end: iso(end) },
    previous: { start: iso(prevStart), end: iso(prevEnd) },
  };
}

export interface DashboardGrowth {
  percent: number;
  text: string;
  type: 'increase' | 'decrease' | 'neutral';
}

// No prior-period activity to compare against is common for a new or quiet
// salon — reported as neutral/0% rather than a meaningless "+Infinity%".
export function computeGrowth(current: number, previous: number): DashboardGrowth {
  if (previous === 0) {
    if (current === 0) return { percent: 0, text: '0%', type: 'neutral' };
    return { percent: 100, text: 'New', type: 'increase' };
  }
  const percent = Math.round(((current - previous) / previous) * 1000) / 10;
  if (percent === 0) return { percent: 0, text: '0%', type: 'neutral' };
  return {
    percent,
    text: `${percent > 0 ? '+' : ''}${percent}%`,
    type: percent > 0 ? 'increase' : 'decrease',
  };
}

export interface DashboardAppointmentRow {
  date: string;
  status: AppointmentStatus | string;
  amount?: number | null;
  duration?: string | null;
  clientKey: string | null; // client.id, businessClient.id, or null for a walk-in with neither
}

const REVENUE_STATUSES = new Set<string>([AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED]);

export interface DashboardMetric {
  current: number;
  previous: number;
  growth: DashboardGrowth;
}

export interface DashboardMetrics {
  revenue: DashboardMetric;
  bookings: DashboardMetric;
  activeClients: DashboardMetric;
  averageServiceTimeMinutes: DashboardMetric;
}

function summarizePeriod(rows: DashboardAppointmentRow[], range: PeriodRange) {
  const inRange = rows.filter((r) => r.date >= range.start && r.date <= range.end);

  const revenue =
    Math.round(
      inRange
        .filter((r) => REVENUE_STATUSES.has(r.status as string))
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0) * 100,
    ) / 100;

  const bookings = inRange.length;

  const activeClients = new Set(inRange.map((r) => r.clientKey).filter((k): k is string => !!k)).size;

  const averageServiceTimeMinutes = inRange.length
    ? Math.round(inRange.reduce((sum, r) => sum + extractDurationMinutes(r.duration), 0) / inRange.length)
    : 0;

  return { revenue, bookings, activeClients, averageServiceTimeMinutes };
}

// rows should already be scoped to one business and span at least the
// previous period's start through the current period's end.
export function computeDashboardMetrics(
  rows: DashboardAppointmentRow[],
  bounds: DashboardPeriodBounds,
): DashboardMetrics {
  const current = summarizePeriod(rows, bounds.current);
  const previous = summarizePeriod(rows, bounds.previous);

  return {
    revenue: { current: current.revenue, previous: previous.revenue, growth: computeGrowth(current.revenue, previous.revenue) },
    bookings: { current: current.bookings, previous: previous.bookings, growth: computeGrowth(current.bookings, previous.bookings) },
    activeClients: {
      current: current.activeClients,
      previous: previous.activeClients,
      growth: computeGrowth(current.activeClients, previous.activeClients),
    },
    averageServiceTimeMinutes: {
      current: current.averageServiceTimeMinutes,
      previous: previous.averageServiceTimeMinutes,
      growth: computeGrowth(current.averageServiceTimeMinutes, previous.averageServiceTimeMinutes),
    },
  };
}
