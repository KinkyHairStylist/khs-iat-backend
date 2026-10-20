import { z } from "zod";

// A salon's gift cards: each is one listing a customer buys. The code is made
// by the server and never part of a request.

export const GIFT_CARD_TEMPLATES = ["valentine", "birthday", "anniversary", "general", "mothers", "fathers", "christmas", "wedding", "graduation", "custom"] as const;

// Benefits are stored comma-separated (the old site's simple-array), so one can't contain a comma.
const benefit = z.string().trim().min(1, "Benefits can't be empty.").max(200).refine((b) => !b.includes(","), "A benefit can't contain a comma.");

export const giftCardSchema = z.object({
  template: z.enum(GIFT_CARD_TEMPLATES, { error: "Choose a template." }),
  title: z.string().trim().min(1, "Enter a title.").max(120),
  description: z.string().trim().max(1000).optional().default(""),
  message: z.string().trim().max(500).optional().default(""),
  amount: z
    .number({ error: "Enter an amount." })
    .min(1, "The amount must be at least 1.")
    .max(100_000, "That amount is too large.")
    .refine((v) => Math.round(v * 100) === Math.round(v * 100 * 1e6) / 1e6, "Use at most 2 decimal places."),
  benefits: z.array(benefit).min(1, "Add at least one benefit.").max(20),
  expiryInDays: z.number({ error: "Enter how many days the card is valid." }).int().min(1, "At least 1 day.").max(365, "At most 365 days."),
});
export type GiftCardInput = z.infer<typeof giftCardSchema>;

export const GIFT_CARD_FILTERS = ["All", "Active", "Inactive", "Used", "Expired"] as const;

export const giftCardListQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  status: z.enum(GIFT_CARD_FILTERS).optional().default("All"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(6),
});
export type GiftCardListQuery = z.infer<typeof giftCardListQuerySchema>;
