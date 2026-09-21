// Pure logic for the merchant sign-up options (paid plan, free trial, free window).
// Nothing here touches the database or Stripe, so it is easy to test.

export type PlanTier = 'Starter' | 'Growth' | 'Pro';
export const PLAN_TIERS: PlanTier[] = ['Starter', 'Growth', 'Pro'];

// How a merchant chose to start: pay for a plan now, take the free trial (not tied
// to a plan), or join the free window that ends on one shared date.
export type SignupOption = 'paid' | 'trial' | 'reveal';
export const SIGNUP_OPTIONS: SignupOption[] = ['paid', 'trial', 'reveal'];

export interface RevealPeriodSetting {
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface RevealStatus {
  enabled: boolean;
  // Can a merchant join it right now?
  open: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  // Whole days remaining, rounded up, from the SERVER clock (never the visitor's).
  daysLeft: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === 'string' && (PLAN_TIERS as string[]).includes(value);
}

export function tierOrDefault(value: unknown, fallback: PlanTier = 'Starter'): PlanTier {
  return isPlanTier(value) ? value : fallback;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function revealStatus(
  setting: Partial<RevealPeriodSetting> | null | undefined,
  now: Date = new Date(),
): RevealStatus {
  const startsAt = parseDate(setting?.startsAt);
  const endsAt = parseDate(setting?.endsAt);
  const enabled = !!setting?.enabled;

  const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS)) : 0;
  const open =
    enabled &&
    !!endsAt &&
    now.getTime() < endsAt.getTime() &&
    (!startsAt || now.getTime() >= startsAt.getTime());

  return { enabled, open, startsAt, endsAt, daysLeft };
}

// Opens a new window of `days` days starting now.
export function startRevealWindow(days: number, now: Date = new Date()): RevealPeriodSetting {
  assertWholeDays(days);
  return {
    enabled: true,
    startsAt: now.toISOString(),
    endsAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
  };
}

// Adds days to the window. If it has already ended, the days count from now (so the
// window reopens); otherwise they are added to the current end date. It only ever
// moves the end later, so nobody already inside it is cut short.
export function extendRevealWindow(
  setting: Partial<RevealPeriodSetting> | null | undefined,
  days: number,
  now: Date = new Date(),
): RevealPeriodSetting {
  assertWholeDays(days);
  const currentEnd = parseDate(setting?.endsAt);
  const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  return {
    enabled: true,
    startsAt: setting?.startsAt ?? now.toISOString(),
    endsAt: new Date(base.getTime() + days * DAY_MS).toISOString(),
  };
}

function assertWholeDays(days: number): void {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new RangeError('Days must be a whole number between 1 and 365.');
  }
}
