import { z } from "zod";
import { calendarDate } from "../fields";

// The salon's services: details, price, who does them, photos, and its categories.

/** Service categories and the types under each (the database's own enums). */
export const SERVICE_CATALOG = {
  "hair-services": ["women-haircut", "men-haircut", "hair-coloring", "hair-treatment", "blow-dry", "braiding"],
  "nail-services": ["manicure", "pedicure", "gel-polish", "acrylic-nails"],
  "makeup-services": ["bridal-makeup", "party-makeup", "natural-glam"],
  "spa-treatments": ["facial", "body-scrub", "massage"],
  barbering: ["men-haircut", "beard-trim", "fade-cut"],
  skincare: ["deep-cleansing-facial", "acne-treatment"],
  "lashes-brows": ["lash-extension", "brow-shaping", "brow-tint"],
  "body-care": ["waxing", "body-polish"],
} as const;
export type ServiceCategory = keyof typeof SERVICE_CATALOG;
export const SERVICE_CATEGORIES = Object.keys(SERVICE_CATALOG) as [ServiceCategory, ...ServiceCategory[]];

const MAX_PRICE = 99_999_999.99;
const money = (label: string) =>
  z.number({ error: `${label} must be a number.` }).positive(`${label} must be more than 0.`).max(MAX_PRICE, `${label} is too large.`)
    .transform((v) => Math.round(v * 100) / 100);
const id = (what: string) => z.string().uuid(`Please choose a valid ${what}.`);

export const serviceSchema = z
  .object({
    name: z.string().trim().min(1, "Service name is required.").max(255, "The name must be 255 characters or fewer."),
    description: z.string().trim().max(1000, "The description must be 1000 characters or fewer.").optional().default(""),
    category: z.enum(SERVICE_CATEGORIES, { error: "Choose a category." }),
    serviceType: z.string().trim().max(60).optional().transform((v) => v || undefined),
    priceType: z.enum(["fixed", "variable"]).default("fixed"),
    price: money("Price").optional(),
    minPrice: money("Minimum price").optional(),
    maxPrice: money("Maximum price").optional(),
    // Minutes, as the salon picks them (15, 30, 60, 90...).
    durationMinutes: z.number({ error: "Choose a duration." }).int().min(5, "Choose a duration.").max(12 * 60, "A service can be at most 12 hours."),
    staffIds: z.array(id("team member")).max(50).default([]).transform((ids) => [...new Set(ids)]),
    images: z.array(z.string().trim().url("One of the photos isn't valid.").max(1000)).max(10, "Add up to 10 photos.").default([]),
    advertisementPlanId: id("advertising plan").nullable().optional(),
  })
  .superRefine((s, ctx) => {
    if (s.serviceType && !(SERVICE_CATALOG[s.category] as readonly string[]).includes(s.serviceType)) {
      ctx.addIssue({ code: "custom", path: ["serviceType"], message: "That service type isn't in the chosen category." });
    }
    if (s.priceType === "fixed" && s.price === undefined) ctx.addIssue({ code: "custom", path: ["price"], message: "Price is required." });
    if (s.priceType === "variable") {
      if (s.minPrice === undefined) ctx.addIssue({ code: "custom", path: ["minPrice"], message: "Minimum price is required." });
      if (s.maxPrice === undefined) ctx.addIssue({ code: "custom", path: ["maxPrice"], message: "Maximum price is required." });
      if (s.minPrice !== undefined && s.maxPrice !== undefined && s.minPrice >= s.maxPrice) {
        ctx.addIssue({ code: "custom", path: ["maxPrice"], message: "The maximum price must be more than the minimum." });
      }
    }
  });
export type ServiceInput = z.infer<typeof serviceSchema>;

export const serviceListQuerySchema = z.object({ date: calendarDate("Dates look like 2026-01-31.") });

export const assignServiceStaffSchema = z.object({
  staffIds: z.array(id("team member")).max(50).transform((ids) => [...new Set(ids)]),
});

export const categorySchema = z.object({ category: z.enum(SERVICE_CATEGORIES, { error: "Choose a category." }) });
