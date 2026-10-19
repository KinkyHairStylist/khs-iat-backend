import prisma from "../../lib/prisma/prisma";

// The platform's payment settings (admin > Platform Settings > Payments),
// read from platform_settings.payments. Owned by the staff app; read-only
// here. Unset values fall back to the same defaults the Kinky-Hair-Stylist
// backend uses.

export interface PaymentSettings {
  /** % of a booking KHS takes from the salon. */
  commissionRate: number;
  /** % taken from the salon on a customer's first booking with it, by the salon's plan. */
  acquisitionFeeTiers: Record<string, number>;
  /** Card processing fee passed to the customer: rate % plus a fixed amount. */
  stripePassthroughRate: number;
  stripePassthroughFixedFee: number;
  /** Kept from a refund when a customer cancels before the salon's cancellation window. */
  earlyCancellationFee: number;
  /** % added on top of a gift card's value when a customer buys one (KHS's fee). */
  giftCardFeeRate: number;
  /** % of a late-cancelled (forfeited) payment the salon keeps; KHS keeps the rest. */
  lateCancellationSalonShare: number;
}

const DEFAULTS: PaymentSettings = {
  commissionRate: 12,
  acquisitionFeeTiers: { Starter: 10, Growth: 5, Pro: 0 },
  stripePassthroughRate: 1.75,
  stripePassthroughFixedFee: 0.3,
  earlyCancellationFee: 10,
  giftCardFeeRate: 5,
  lateCancellationSalonShare: 70,
};

const numberOr = (value: unknown, fallback: number) => {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const row = await prisma.platform_settings.findFirst({ select: { payments: true } });
  const p = (row?.payments ?? {}) as Record<string, unknown>;
  const tiers = (p.acquisitionFeeTiers ?? {}) as Record<string, unknown>;
  return {
    commissionRate: numberOr(p.commissionRate, DEFAULTS.commissionRate),
    acquisitionFeeTiers: Object.fromEntries(
      Object.entries(DEFAULTS.acquisitionFeeTiers).map(([tier, rate]) => [tier, numberOr(tiers[tier], rate)]),
    ),
    stripePassthroughRate: numberOr(p.stripePassthroughRate, DEFAULTS.stripePassthroughRate),
    stripePassthroughFixedFee: numberOr(p.stripePassthroughFixedFee, DEFAULTS.stripePassthroughFixedFee),
    earlyCancellationFee: numberOr(p.earlyCancellationFee, DEFAULTS.earlyCancellationFee),
    // Stored as "platformFee" (its old name, still what admin edits).
    giftCardFeeRate: numberOr(p.platformFee, DEFAULTS.giftCardFeeRate),
    lateCancellationSalonShare: Math.min(100, numberOr(p.lateCancellationStylistShare, DEFAULTS.lateCancellationSalonShare)),
  };
}
