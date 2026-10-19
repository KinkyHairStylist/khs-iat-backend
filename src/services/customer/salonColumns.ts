import { Prisma } from "../../generated/prisma/client";

// The columns the public salon pages may read, shared by search, the salon
// page and "similar salons". Raw SQL so enum columns come back as their stored
// values ("women-haircut") rather than Prisma's enum names ("women_haircut").

// What a customer may see of a salon. Leaves out the owner's revenue figures,
// email address and Stripe account; the phone number is the salon's contact.
export const BUSINESS_COLUMNS = Prisma.sql`
  b.id, b."businessName", b.description, b.owner_id AS "ownerId", b."ownerName", b."ownerPhone",
  b."primaryAudience", b.service, b.category, b."businessAddress", b.country, b."businessImage",
  b.longitude, b.latitude, b."companySize"::text AS "companySize", b."howDidYouHear", b.status::text AS status,
  b."isLuxury", b."luxuryOverride", b.bookings, b.plan, b."planTier"::text AS "planTier", b.performance,
  b."createdAt", b."updatedAt"`;

// Prices are sent as text so 10.50 never turns into 10.499999.
export const SERVICE_COLUMNS = Prisma.sql`
  s.id, s.name, s.category::text AS category, s."serviceType"::text AS "serviceType", s.description,
  s."priceType"::text AS "priceType", s.price::text AS price, s."minPrice"::text AS "minPrice",
  s."maxPrice"::text AS "maxPrice", s.duration, s.images, s."createdAt", s."updatedAt", s."businessId"`;

export type BusinessRow = { id: string } & Record<string, unknown>;
export type ServiceRow = { id: string; businessId: string } & Record<string, unknown>;

/** Groups service rows by their salon. */
export function groupByBusiness<T extends { businessId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.businessId) ?? [];
    list.push(row);
    grouped.set(row.businessId, list);
  }
  return grouped;
}
