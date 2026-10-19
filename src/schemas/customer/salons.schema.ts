import { z } from "zod";

// Every service type a salon can offer — the values of the shared database's
// "Service_servicetype_enum" (owned by Kinky-Hair-Stylist-BE-Redesign).
export const SERVICE_TYPES = [
  "women-haircut", "men-haircut", "hair-coloring", "hair-treatment", "blow-dry", "braiding",
  "manicure", "pedicure", "gel-polish", "acrylic-nails",
  "bridal-makeup", "party-makeup", "natural-glam",
  "facial", "body-scrub", "massage",
  "beard-trim", "fade-cut",
  "deep-cleansing-facial", "acne-treatment",
  "lash-extension", "brow-shaping", "brow-tint",
  "waxing", "body-polish",
] as const;

const SERVICE_TYPE_SET = new Set<string>(SERVICE_TYPES);

// Query strings arrive as text; a missing or unreadable number means "no filter".
const optionalNumber = z.preprocess(
  (v) => (v === undefined || v === "" ? undefined : Number(v)),
  z.number().finite().optional()
);

const flag = z.preprocess((v) => v === "true" || v === true, z.boolean());

export const listSalonsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).transform((n) => Math.min(n, 100)).catch(10),
  search: z.string().trim().max(100).catch(""),
  location: z.string().trim().max(100).catch(""),
  minRating: z.coerce.number().min(0).max(5).catch(0),
  isLuxury: flag,
  // ?services=a&services=b, or axios's ?services[]=a&services[]=b. Values that
  // aren't a real service type are dropped, never an error.
  services: z.preprocess(
    (v) => (Array.isArray(v) ? v : v === undefined || v === "" ? [] : [v]),
    z.array(z.string()).transform((list) => list.filter((s) => SERVICE_TYPE_SET.has(s)))
  ),
  sortBy: z.enum(["bestMatch", "topRated", "distance"]).catch("bestMatch"),
  lat: optionalNumber.pipe(z.number().min(-90).max(90).optional()).catch(undefined),
  lng: optionalNumber.pipe(z.number().min(-180).max(180).optional()).catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().catch(undefined),
  // ─── Availability ─────────────────────────────────────────────────────────
  // Open right now: the customer's local date and time ("2026-07-14T14:30"),
  // sent by the browser so the weekday and hour are theirs, not the server's.
  openAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/).optional().catch(undefined),
  openWeekends: flag,
  openEvenings: flag,
  walkIns: flag,
});

export type ListSalonsInput = z.infer<typeof listSalonsSchema>;

/** req.query → schema input, folding axios's "services[]" key into "services". */
export function salonsQuery(query: Record<string, unknown>): Record<string, unknown> {
  const { "services[]": bracketed, ...rest } = query;
  return bracketed !== undefined && rest.services === undefined ? { ...rest, services: bracketed } : rest;
}

// A salon or review id from the URL. Anything that isn't a uuid can't exist,
// so it's a 404 like any unknown id, not a validation error.
export const salonIdSchema = z.object({ id: z.string().uuid() });
export const reviewIdSchema = z.object({ reviewId: z.string().uuid() });
