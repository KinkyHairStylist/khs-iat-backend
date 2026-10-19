import { Prisma } from "../../generated/prisma/client";
import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";

// The memberships shop: every approved salon's packages (a number of sessions
// of one service, paid up front), with what they save over booking one by one.

const FOR_SALE_WHERE = { isActive: true, businesses: { status: "approved" } } as const;

const SHOP_SELECT = {
  id: true, businessId: true, serviceId: true, pricePerSession: true, sessionCount: true, expiryDays: true,
  businesses: { select: { businessName: true, businessAddress: true } },
  Service: { select: { name: true, category: true, price: true, priceType: true } },
} as const;

type ShopRow = Prisma.merchant_membership_packagesGetPayload<{ select: typeof SHOP_SELECT }>;

const cents = (amount: { toString(): string }) => Math.round(Number(amount.toString()) * 100);

/** A package as the shop shows it: only what a customer needs, never the salon's owner details. */
export function toShopPackage(pkg: ShopRow) {
  const perSessionCents = cents(pkg.pricePerSession);
  const totalCents = perSessionCents * pkg.sessionCount;
  // What the same sessions cost booked one by one; only a fixed-price service has a regular price.
  const regularCents = pkg.Service.price !== null && pkg.Service.priceType !== "variable" ? cents(pkg.Service.price) * pkg.sessionCount : null;
  return {
    id: pkg.id,
    businessId: pkg.businessId,
    businessName: pkg.businesses.businessName,
    businessAddress: pkg.businesses.businessAddress,
    serviceId: pkg.serviceId,
    serviceName: pkg.Service.name ?? "Service",
    serviceCategory: pkg.Service.category,
    pricePerSession: perSessionCents / 100,
    sessionCount: pkg.sessionCount,
    expiryDays: pkg.expiryDays,
    total: totalCents / 100,
    // Only when the package really is cheaper.
    saving: regularCents !== null && regularCents > totalCents ? (regularCents - totalCents) / 100 : 0,
  };
}

/** Every package for sale (or one salon's), newest first. */
export async function listPackagesForSale(businessId?: string) {
  const rows = await prisma.merchant_membership_packages.findMany({
    where: { ...FOR_SALE_WHERE, ...(businessId ? { businessId } : {}) },
    select: SHOP_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toShopPackage);
}

/** One package for the purchase page. */
export async function getPackageForSale(packageId: string) {
  const row = await prisma.merchant_membership_packages.findFirst({ where: { id: packageId, ...FOR_SALE_WHERE }, select: SHOP_SELECT });
  if (!row) throw AppError.notFound("Membership package");
  return toShopPackage(row);
}
