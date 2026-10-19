// Calendar periods on plain "YYYY-MM-DD" dates (the salon's own calendar), so
// "today" never shifts with the server's time zone.

export type Period = "today" | "week" | "month";
export interface DateRange {
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  end: string;
}

const DAY_MS = 86_400_000;

function toUtc(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => iso(new Date(toUtc(date).getTime() + days * DAY_MS));

/** Sunday to Saturday around `date` (the week the team figures use). */
export function weekOf(date: string): DateRange {
  const start = addDays(date, -toUtc(date).getUTCDay());
  return { start, end: addDays(start, 6) };
}

export function monthOf(date: string): DateRange {
  const d = toUtc(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { start: iso(start), end: iso(end) };
}

/** The period containing `date`, and the one before it (for "vs yesterday / last week / last month"). */
export function periodBounds(period: Period, date: string): { current: DateRange; previous: DateRange } {
  if (period === "today") return { current: { start: date, end: date }, previous: { start: addDays(date, -1), end: addDays(date, -1) } };
  if (period === "week") {
    const current = weekOf(date);
    return { current, previous: { start: addDays(current.start, -7), end: addDays(current.start, -1) } };
  }
  const current = monthOf(date);
  return { current, previous: monthOf(addDays(current.start, -1)) };
}

export interface Growth {
  percent: number;
  text: string;
  type: "increase" | "decrease" | "neutral";
}

/** Change from the previous period, as the dashboard cards show it. */
export function growth(current: number, previous: number): Growth {
  if (previous === 0) return current === 0 ? { percent: 0, text: "0%", type: "neutral" } : { percent: 100, text: "New", type: "increase" };
  const percent = Math.round(((current - previous) / previous) * 1000) / 10;
  if (percent === 0) return { percent: 0, text: "0%", type: "neutral" };
  return { percent, text: `${percent > 0 ? "+" : ""}${percent}%`, type: percent > 0 ? "increase" : "decrease" };
}
