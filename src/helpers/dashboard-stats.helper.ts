// Pure helpers for the admin dashboard numbers. Nothing here touches the database, so the
// maths (percent changes, money formatting, pie-chart shares) is easy to test.

export type ChangeType = 'increase' | 'decrease' | 'neutral';

// How much `current` moved compared with `previous`. With nothing to compare against there is no
// honest percentage, so it says so instead of inventing "+100%".
export function percentChange(
  current: number,
  previous: number,
): { text: string; type: ChangeType } {
  if (previous <= 0) {
    return current > 0 ? { text: 'New', type: 'increase' } : { text: '0%', type: 'neutral' };
  }
  const diff = ((current - previous) / previous) * 100;
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return { text: '0%', type: 'neutral' };
  return { text: `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}%`, type: rounded > 0 ? 'increase' : 'decrease' };
}

export function formatMoney(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(2)}`;
}

// Exact money for lists such as "top salons", e.g. $6,250 or $1,234.50.
export function formatMoneyExact(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Turns counts into whole-number shares that add up to exactly 100. Keeps the biggest
// `maxSlices - 1` groups and folds everything else into "Other", so the chart covers ALL bookings
// rather than only the top few.
export function shareSlices(
  rows: Array<{ name: string; count: number }>,
  maxSlices = 4,
): Array<{ name: string; value: number }> {
  // Rows with the same name (e.g. several uncategorised services) count as one group, and
  // "Other" is always the last bucket, holding anything not shown on its own.
  const merged = new Map<string, number>();
  for (const r of rows) merged.set(r.name, (merged.get(r.name) ?? 0) + r.count);
  const otherBase = merged.get('Other') ?? 0;
  merged.delete('Other');
  const named = [...merged.entries()]
    .map(([name, count]) => ({ name, count }))
    .filter((r) => r.count > 0)
    .sort((x, y) => y.count - x.count);
  const total = named.reduce((sum, r) => sum + r.count, 0) + otherBase;
  if (total <= 0) return [];

  const needsFold = named.length + (otherBase > 0 ? 1 : 0) > maxSlices;
  const kept = needsFold ? named.slice(0, maxSlices - 1) : named;
  const folded = needsFold ? named.slice(maxSlices - 1).reduce((sum, r) => sum + r.count, 0) : 0;
  const otherCount = otherBase + folded;
  const groups = otherCount > 0 ? [...kept, { name: 'Other', count: otherCount }] : kept;

  // Largest-remainder rounding so the shares always sum to 100.
  const raw = groups.map((g) => (g.count / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return groups.map((g, index) => ({ name: g.name, value: floors[index] }));
}

// Each item's bar as a share of the leader, so the best performer is 100%.
export function shareOfLeader(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => Math.round((v / max) * 100));
}

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800',
  completed: 'bg-green-100 text-green-800',
  confirmed: 'bg-blue-100 text-blue-800',
  pending: 'bg-amber-100 text-amber-800',
  under_review: 'bg-amber-100 text-amber-800',
  rescheduled: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-red-100 text-red-800',
  suspended: 'bg-red-100 text-red-800',
};

export function statusColor(status: string | null | undefined): string {
  return STATUS_COLORS[String(status ?? '').toLowerCase()] ?? 'bg-gray-100 text-gray-800';
}

export function statusLabel(status: string | null | undefined): string {
  const text = String(status ?? '').replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unknown';
}
