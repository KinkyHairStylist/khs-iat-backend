import prisma from "../../../lib/prisma/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import { AppError } from "../../../middlewares/centralAppError";
import type { MembershipPackageInput } from "../../../schemas/merchant/memberships.schema";
import { requireMerchantBusiness } from "../merchantBusiness";

// Membership packages a salon sells. Taking one off sale stops new purchases
// only; customers who bought it keep their sessions until they expire.

const SELECT = {
  id: true, serviceId: true, pricePerSession: true, sessionCount: true, expiryDays: true, isActive: true, createdAt: true,
  Service: { select: { name: true } },
  _count: { select: { merchant_membership_purchases: true } },
} satisfies Prisma.merchant_membership_packagesSelect;

type Row = Prisma.merchant_membership_packagesGetPayload<{ select: typeof SELECT }>;

const view = (p: Row) => {
  const price = Number(p.pricePerSession);
  return {
    id: p.id,
    serviceId: p.serviceId,
    serviceName: p.Service?.name ?? null,
    pricePerSession: price,
    sessionCount: p.sessionCount,
    total: Math.round(price * p.sessionCount * 100) / 100,
    expiryDays: p.expiryDays,
    isActive: p.isActive,
    purchases: p._count.merchant_membership_purchases,
    createdAt: p.createdAt.toISOString(),
  };
};
export type MembershipPackageView = ReturnType<typeof view>;

export async function listPackages(userId: string): Promise<MembershipPackageView[]> {
  const business = await requireMerchantBusiness(userId);
  const rows = await prisma.merchant_membership_packages.findMany({ where: { businessId: business.id }, select: SELECT, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] });
  return rows.map(view);
}

export async function createPackage(userId: string, input: MembershipPackageInput): Promise<MembershipPackageView> {
  const business = await requireMerchantBusiness(userId);
  const service = await prisma.service.findFirst({ where: { id: input.serviceId, businessId: business.id }, select: { id: true } });
  if (!service) throw AppError.badRequest("Choose one of your own services.", "SERVICE_NOT_FOUND");
  const created = await prisma.merchant_membership_packages.create({
    data: { businessId: business.id, serviceId: service.id, pricePerSession: input.pricePerSession, sessionCount: input.sessionCount, expiryDays: input.expiryDays, isActive: true },
    select: SELECT,
  });
  return view(created);
}

export async function deactivatePackage(userId: string, id: string): Promise<MembershipPackageView> {
  const business = await requireMerchantBusiness(userId);
  const updated = await prisma.merchant_membership_packages.updateMany({ where: { id, businessId: business.id }, data: { isActive: false, updatedAt: new Date() } });
  if (!updated.count) throw AppError.notFound("Membership package");
  return view(await prisma.merchant_membership_packages.findUniqueOrThrow({ where: { id }, select: SELECT }));
}
