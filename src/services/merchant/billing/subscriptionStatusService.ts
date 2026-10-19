import prisma from "../../../lib/prisma/prisma";
import { requireMerchantBusiness } from "../merchantBusiness";

/**
 * The merchant's plan, for the dashboard's access check and the billing page.
 * A business with no record yet is on a Trial that starts when an admin approves it.
 */
export async function getSubscriptionStatus(userId: string) {
  const business = await requireMerchantBusiness(userId);
  const [sub, row] = await Promise.all([
    prisma.merchant_subscriptions.findUnique({
      where: { businessId: business.id },
      select: { status: true, kind: true, trialEndsAt: true, currentPeriodEnd: true, stripeSubscriptionId: true },
    }),
    prisma.businesses.findUniqueOrThrow({ where: { id: business.id }, select: { planTier: true } }),
  ]);
  return {
    status: sub?.status ?? null,
    kind: sub?.kind ?? null,
    trialEndsAt: sub?.trialEndsAt ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    // A card can be added mid-trial (still "trialing" until it ends): this tells the two apart.
    hasPaymentMethod: !!sub?.stripeSubscriptionId,
    planTier: row.planTier,
  };
}
