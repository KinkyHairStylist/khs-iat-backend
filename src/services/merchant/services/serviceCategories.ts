import prisma from "../../../lib/prisma/prisma";
import type { Service_category_enum } from "../../../generated/prisma/enums";
import { AppError } from "../../../middlewares/centralAppError";
import { requireMerchantBusiness } from "../merchantBusiness";
import { categoriesOf, toDbEnum } from "./serviceQueries";

// The categories a salon shows on its services page (and to customers).

async function categories(businessId: string) {
  const row = await prisma.businesses.findUnique({ where: { id: businessId }, select: { category: true } });
  return categoriesOf(row?.category ?? null);
}

export async function addCategory(userId: string, category: string) {
  const business = await requireMerchantBusiness(userId);
  await prisma.$executeRaw`
    UPDATE businesses SET category = COALESCE(category, '[]'::jsonb) || to_jsonb(${category}::text)
    WHERE id = ${business.id}::uuid AND NOT (COALESCE(category, '[]'::jsonb) ? ${category})`;
  return { categories: await categories(business.id) };
}

/** Removes a category no service uses any more. */
export async function removeCategory(userId: string, category: string) {
  const business = await requireMerchantBusiness(userId);
  const inUse = await prisma.service.count({ where: { businessId: business.id, category: toDbEnum<Service_category_enum>(category) } });
  if (inUse > 0) throw AppError.conflict("Move or delete this category's services first.", "CATEGORY_IN_USE");
  await prisma.$executeRaw`
    UPDATE businesses SET category = COALESCE(category, '[]'::jsonb) - ${category}::text WHERE id = ${business.id}::uuid`;
  return { categories: await categories(business.id) };
}
