import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";

// A salon's public booking link, /booking/<link>. The merchant's settings hand out
// "<name-slug>-<first 8 id chars>", so two salons with the same name get different links.
// Links from before that (the name alone, or the raw id) still resolve; a name shared by
// several salons returns them all for the visitor to pick from.

export interface SalonChoice {
  id: string;
  businessName: string;
  businessAddress: string | null;
}

export interface SalonLinkResult {
  salonId: string | null;
  matches: SalonChoice[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID_SUFFIX = /^(.*)-([0-9a-f]{8})$/;

/** Same rule as the frontend's salonSlug(): lower case, runs of anything else become "-". */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// The SQL twin of slugify, so the match happens in the database over every salon.
async function approvedByNameSlug(nameSlug: string, idPrefix?: string): Promise<SalonChoice[]> {
  return prisma.$queryRaw<SalonChoice[]>`
    SELECT b.id, b."businessName", b."businessAddress" FROM businesses b
    WHERE b.status = 'approved'
      AND trim(both '-' from regexp_replace(lower(trim(b."businessName")), '[^a-z0-9]+', '-', 'g')) = ${nameSlug}
      AND (${idPrefix ?? null}::text IS NULL OR b.id::text LIKE ${`${idPrefix ?? ""}%`})
    ORDER BY b."businessName", b.id
    LIMIT 20`;
}

const result = (matches: SalonChoice[]): SalonLinkResult => {
  if (matches.length === 0) throw AppError.notFound("Salon");
  return { salonId: matches.length === 1 ? matches[0].id : null, matches };
};

export async function resolveSalonLink(raw: string): Promise<SalonLinkResult> {
  const link = slugify(raw);
  if (!link) throw AppError.notFound("Salon");

  if (UUID.test(raw.toLowerCase())) {
    const salon = await prisma.businesses.findFirst({ where: { id: raw.toLowerCase(), status: "approved" }, select: { id: true, businessName: true, businessAddress: true } });
    return result(salon ? [salon] : []);
  }

  const withId = ID_SUFFIX.exec(link);
  if (withId) {
    const exact = await approvedByNameSlug(withId[1], withId[2]);
    if (exact.length > 0) return result(exact);
  }
  // The name alone (older links), which may also just end in 8 hex-looking characters.
  return result(await approvedByNameSlug(link));
}
