import prisma from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { SERVICE_TYPES, type ListSalonsInput } from "../../schemas/customer/salons.schema";
import { RATING, whereClause } from "./salonFilters";
import { BUSINESS_COLUMNS, SERVICE_COLUMNS, groupByBusiness, type BusinessRow, type ServiceRow } from "./salonColumns";

// Public salon search — the same filters, sorting and response shape as the
// Kinky-Hair-Stylist backend's GET /salons. Raw SQL because the sorts work on
// a JSON field (performance->>'rating') and Prisma would return enum names
// ("women_haircut") instead of the stored values ("women-haircut").

function orderClause({ sortBy, lat, lng }: ListSalonsInput): Prisma.Sql {
  switch (sortBy) {
    case "topRated":
      return Prisma.sql`ORDER BY ${RATING} DESC, b.revenue DESC, b.id`;
    case "distance":
      if (lat !== undefined && lng !== undefined) {
        // Great-circle distance in km; LEAST/GREATEST keep rounding errors inside ACOS's domain.
        const distance = Prisma.sql`6371 * ACOS(LEAST(1, GREATEST(-1,
          COS(RADIANS(${lat})) * COS(RADIANS(b.latitude)) * COS(RADIANS(b.longitude) - RADIANS(${lng}))
          + SIN(RADIANS(${lat})) * SIN(RADIANS(b.latitude)))))`;
        return Prisma.sql`ORDER BY ${distance} ASC NULLS LAST, b.id`;
      }
      return Prisma.sql`ORDER BY b."createdAt" DESC, b.id`;
    case "bestMatch":
    default:
      return Prisma.sql`ORDER BY ${RATING} DESC, b."createdAt" DESC, b.id`;
  }
}

export async function listSalons(input: ListSalonsInput) {
  const where = whereClause(input);
  const offset = (input.page - 1) * input.limit;

  const [rows, [{ total }]] = await Promise.all([
    prisma.$queryRaw<BusinessRow[]>`
      SELECT ${BUSINESS_COLUMNS} FROM businesses b ${where} ${orderClause(input)}
      LIMIT ${input.limit} OFFSET ${offset}`,
    prisma.$queryRaw<[{ total: number }]>`SELECT COUNT(*)::int AS total FROM businesses b ${where}`,
  ]);

  // Every listed salon's services in one query, grouped in memory. When the
  // search filtered by service, only those services are attached.
  let servicesByBusiness = new Map<string, ServiceRow[]>();
  if (rows.length > 0) {
    const onlyTypes = input.services.length > 0
      ? Prisma.sql`AND s."serviceType"::text IN (${Prisma.join(input.services)})`
      : Prisma.empty;
    servicesByBusiness = groupByBusiness(await prisma.$queryRaw<ServiceRow[]>`
      SELECT ${SERVICE_COLUMNS} FROM "Service" s
      WHERE s."businessId" = ANY(${rows.map((r) => r.id)}::uuid[]) ${onlyTypes}`);
  }

  return {
    data: rows.map((row) => ({ ...row, serviceList: servicesByBusiness.get(row.id) ?? [] })),
    total,
    page: input.page,
    limit: input.limit,
  };
}

/** Every service type as { value, label } — "women-haircut" → "Women Haircut". */
export function listServiceTypes(): Array<{ value: string; label: string }> {
  return SERVICE_TYPES.map((value) => ({
    value,
    label: value
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
  }));
}

/** The distinct cities (last part of the address) approved salons are in, A–Z. */
export async function listLocations(): Promise<string[]> {
  const rows = await prisma.businesses.findMany({
    where: { status: "approved", businessAddress: { not: null } },
    distinct: ["businessAddress"],
    select: { businessAddress: true },
  });

  // "Lagos" and "lagos" are one place: keep the first spelling seen.
  const seen = new Map<string, string>();
  for (const { businessAddress } of rows) {
    const location = (businessAddress ?? "").split(",").pop()?.trim() ?? "";
    if (location && !seen.has(location.toLowerCase())) seen.set(location.toLowerCase(), location);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
