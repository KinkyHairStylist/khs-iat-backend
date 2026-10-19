import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";
import { BUSINESS_COLUMNS, SERVICE_COLUMNS, groupByBusiness, type BusinessRow, type ServiceRow } from "./salonColumns";
import { RATING } from "./salonFilters";

// "Salons who offer similar services" on the salon page: other approved
// salons sharing at least one category with this one, best rated first.

const SIMILAR_LIMIT = 4;

export async function getSimilarSalons(businessId: string) {
  const current = await prisma.businesses.findFirst({
    where: { id: businessId, status: "approved" },
    select: { category: true },
  });
  if (!current) throw AppError.notFound("Salon");

  // `category` is a JSON array of strings; a salon can be in more than one.
  const categories = Array.isArray(current.category)
    ? current.category.filter((c): c is string => typeof c === "string" && c.length > 0)
    : [];
  if (categories.length === 0) return [];

  const rows = await prisma.$queryRaw<BusinessRow[]>`
    SELECT ${BUSINESS_COLUMNS} FROM businesses b
    WHERE b.status = 'approved' AND b.id <> ${businessId}::uuid
      AND jsonb_typeof(b.category) = 'array' AND b.category ?| ${categories}::text[]
    ORDER BY ${RATING} DESC, b.id
    LIMIT ${SIMILAR_LIMIT}`;
  if (rows.length === 0) return [];

  const services = groupByBusiness(await prisma.$queryRaw<ServiceRow[]>`
    SELECT ${SERVICE_COLUMNS} FROM "Service" s
    WHERE s."businessId" = ANY(${rows.map((r) => r.id)}::uuid[])
    ORDER BY s."createdAt" ASC, s.id`);
  return rows.map((row) => ({ ...row, serviceList: services.get(row.id) ?? [] }));
}
