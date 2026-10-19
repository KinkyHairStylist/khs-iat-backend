// Pure logic for the merchant plans: Trial (N days), MVP (a window with one
// shared end date) and the paid Starter / Growth / Pro. Same as
// khs-iat-staff-be/src/utils/merchantPlans.ts (which also edits the window) —
// keep the two in step.

export type PlanTier = "Starter" | "Growth" | "Pro";
export const PLAN_TIERS: PlanTier[] = ["Starter", "Growth", "Pro"];

// How a merchant starts at sign-up: a paid plan, the Trial or MVP.
export type SignupOption = "paid" | "trial" | "reveal";
export const SIGNUP_OPTIONS: SignupOption[] = ["paid", "trial", "reveal"];

export interface RevealPeriodSetting {
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export interface RevealStatus {
  enabled: boolean;
  /** Can a merchant join it right now? */
  open: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  /** Whole days remaining, rounded up, from the SERVER clock. */
  daysLeft: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && (PLAN_TIERS as string[]).includes(value);
}

export function tierOrDefault(value: unknown, fallback: PlanTier = "Starter"): PlanTier {
  return isPlanTier(value) ? value : fallback;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function revealStatus(
  setting: Partial<RevealPeriodSetting> | null | undefined,
  now: Date = new Date()
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
