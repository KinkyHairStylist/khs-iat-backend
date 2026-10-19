import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";

// The business a signed-in merchant manages. Every merchant route goes through
// this, so a merchant only ever reads or changes their own salon.

export interface MerchantBusiness {
  id: string;
  businessName: string;
  status: string;
  ownerId: string;
  revenueGoal: number | null;
}

/** The merchant's business, or 403 NO_BUSINESS (they go to the business setup). */
export async function requireMerchantBusiness(userId: string): Promise<MerchantBusiness> {
  const business = await prisma.businesses.findFirst({
    where: { owner_id: userId },
    select: { id: true, businessName: true, status: true, owner_id: true, revenueGoal: true },
    orderBy: { createdAt: "asc" },
  });
  if (!business) throw AppError.forbidden("Set up your business first.", "NO_BUSINESS");
  return {
    id: business.id,
    businessName: business.businessName,
    status: business.status,
    ownerId: business.owner_id,
    revenueGoal: business.revenueGoal !== null ? Number(business.revenueGoal) : null,
  };
}
