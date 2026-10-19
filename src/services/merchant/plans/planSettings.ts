import prisma from "../../../lib/prisma/prisma";
import { PLAN_TIERS, type PlanTier, type RevealPeriodSetting, revealStatus, tierOrDefault } from "../../../utils/merchantPlans";

// The merchant plans part of platform_settings.payments (admin > Platform
// Settings > Plans). Owned by the staff app; read here, plus one write: a
// plan's Stripe price id when the stored one doesn't exist in this Stripe
// account. Defaults match khs-iat-staff-be's platformSettingsService.

export interface PlanSettings {
  acquisitionFeeTiers: Record<PlanTier, number>;
  commissionRate: number;
  trialDays: number;
  trialFeeTier: PlanTier;
  revealFeeTier: PlanTier;
  revealPeriod: RevealPeriodSetting;
  subscriptionPrices: Record<PlanTier, { priceId: string; displayAmount: number }>;
}

const DEFAULTS: PlanSettings = {
  acquisitionFeeTiers: { Starter: 10, Growth: 5, Pro: 0 },
  commissionRate: 12,
  trialDays: 14,
  trialFeeTier: "Starter",
  revealFeeTier: "Starter",
  revealPeriod: { enabled: false, startsAt: null, endsAt: null },
  subscriptionPrices: {
    Starter: { priceId: "", displayAmount: 29.99 },
    Growth: { priceId: "", displayAmount: 59.99 },
    Pro: { priceId: "", displayAmount: 99.99 },
  },
};

export async function getPlanSettings(): Promise<PlanSettings> {
  const row = await prisma.platform_settings.findFirst({ select: { payments: true } });
  const stored = (row?.payments ?? {}) as Partial<PlanSettings>;
  return {
    acquisitionFeeTiers: { ...DEFAULTS.acquisitionFeeTiers, ...stored.acquisitionFeeTiers },
    commissionRate: stored.commissionRate ?? DEFAULTS.commissionRate,
    trialDays: stored.trialDays ?? DEFAULTS.trialDays,
    trialFeeTier: tierOrDefault(stored.trialFeeTier),
    revealFeeTier: tierOrDefault(stored.revealFeeTier),
    revealPeriod: stored.revealPeriod ?? DEFAULTS.revealPeriod,
    subscriptionPrices: { ...DEFAULTS.subscriptionPrices, ...stored.subscriptionPrices },
  };
}

/** Records a plan's new Stripe price id, leaving every other payment setting as it is. */
export async function savePlanPriceId(tier: PlanTier, priceId: string, displayAmount: number): Promise<void> {
  // One jsonb_set, so a concurrent admin edit of another setting isn't overwritten.
  await prisma.$executeRaw`
    UPDATE platform_settings
    SET payments = jsonb_set(COALESCE(payments::jsonb, '{}'::jsonb), ${["subscriptionPrices", tier]}::text[],
                             ${JSON.stringify({ priceId, displayAmount })}::jsonb, true)`;
}

/** What the plan step and the pricing page show (no Stripe ids). */
export async function getPublicPlans(now: Date = new Date()) {
  const payments = await getPlanSettings();
  const reveal = revealStatus(payments.revealPeriod, now);
  const feeRate = (tier: PlanTier) => Number(payments.acquisitionFeeTiers[tier]) || 0;

  const tiers = {} as Record<PlanTier, { displayAmount: number; acquisitionFeeRate: number; available: boolean }>;
  for (const tier of PLAN_TIERS) {
    const price = payments.subscriptionPrices[tier];
    tiers[tier] = {
      displayAmount: Number(price?.displayAmount) || 0,
      acquisitionFeeRate: feeRate(tier),
      // A plan can only be bought once it has a Stripe price behind it.
      available: !!price?.priceId,
    };
  }

  return {
    tiers,
    commissionRate: Number(payments.commissionRate) || 0,
    trial: { days: payments.trialDays, feeTier: payments.trialFeeTier, acquisitionFeeRate: feeRate(payments.trialFeeTier) },
    reveal: {
      available: reveal.open,
      endsAt: reveal.endsAt,
      daysLeft: reveal.daysLeft,
      feeTier: payments.revealFeeTier,
      acquisitionFeeRate: feeRate(payments.revealFeeTier),
    },
  };
}

export type PublicPlans = Awaited<ReturnType<typeof getPublicPlans>>;
