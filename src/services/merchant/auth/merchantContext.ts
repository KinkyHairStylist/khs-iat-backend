import prisma from "../../../lib/prisma/prisma";

/** businessImage holds an array of URLs (older rows: one URL as a string). */
function firstImage(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : null;
  return typeof value === "string" && value ? value : null;
}

/**
 * The business a merchant runs (their first, as before), or none yet — the
 * merchant app sends a merchant without one to the business setup.
 */
export async function getMerchantBusiness(userId: string) {
  const business = await prisma.businesses.findFirst({
    where: { owner_id: userId },
    select: { id: true, businessName: true, status: true, businessImage: true },
    orderBy: { createdAt: "asc" },
  });
  if (!business) return { hasBusiness: false, business: null };
  const { businessImage, ...rest } = business;
  return { hasBusiness: true, business: { ...rest, logo: firstImage(businessImage) } };
}
