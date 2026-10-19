import { Prisma } from "../../generated/prisma/client";
import { containsPattern } from "../../utils/sqlLike";
import type { ListSalonsInput } from "../../schemas/customer/salons.schema";

// The WHERE clause of the public salon search (see salonsService). Every
// value goes in as a bound parameter.

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Open at or after this on some day counts as "open evenings".
const EVENING_FROM = "19:00";

export const RATING = Prisma.sql`COALESCE((b.performance->>'rating')::float, 0)`;

const weekdayOf = (isoDate: string) => WEEKDAY_NAMES[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];

/** The salon has opening hours matching `condition` (on its booking_days rows, alias d). */
const hasOpenDay = (condition: Prisma.Sql) =>
  Prisma.sql`EXISTS (SELECT 1 FROM booking_days d WHERE d."businessId" = b.id AND d."isOpen" = true AND ${condition})`;

const openOn = (day: string, time?: string) =>
  hasOpenDay(
    time
      ? Prisma.sql`d.day = ${day} AND d."startTime" <= ${time}::time AND d."endTime" >= ${time}::time`
      : Prisma.sql`d.day = ${day}`
  );

export function whereClause(input: ListSalonsInput): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`b.status = 'approved'`];

  if (input.search) {
    const like = containsPattern(input.search);
    conditions.push(Prisma.sql`(b."businessName" ILIKE ${like} OR b.description ILIKE ${like})`);
  }
  if (input.location) {
    conditions.push(Prisma.sql`b."businessAddress" ILIKE ${containsPattern(input.location)}`);
  }
  if (input.minRating > 0) {
    conditions.push(Prisma.sql`${RATING} >= ${input.minRating}`);
  }
  // An admin's luxury decision wins either way; with none, a 4.5+ rating qualifies.
  if (input.isLuxury) {
    conditions.push(Prisma.sql`(b."luxuryOverride" = true OR (b."luxuryOverride" IS NULL AND ${RATING} >= 4.5))`);
  }
  // A salon must offer every service asked for.
  for (const serviceType of input.services) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Service" s WHERE s."businessId" = b.id AND s."serviceType"::text = ${serviceType})`
    );
  }

  // ─── Availability ───────────────────────────────────────────────────────────
  // Open on a chosen day (and at a chosen time, if given).
  if (input.date) conditions.push(openOn(weekdayOf(input.date), input.time));
  // Open right now, in the customer's own time.
  if (input.openAt) {
    const [date, time] = input.openAt.split("T");
    conditions.push(openOn(weekdayOf(date), time));
  }
  if (input.openWeekends) conditions.push(hasOpenDay(Prisma.sql`d.day IN ('Saturday', 'Sunday')`));
  if (input.openEvenings) conditions.push(hasOpenDay(Prisma.sql`d."endTime" >= ${EVENING_FROM}::time`));
  // The salon's owner has recorded walk-in clients (merchants mark each client's source).
  if (input.walkIns) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM clients c WHERE c.owner_id = b.owner_id AND c."isActive" = true AND c."clientSource"::text = 'walk-in')`
    );
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}
