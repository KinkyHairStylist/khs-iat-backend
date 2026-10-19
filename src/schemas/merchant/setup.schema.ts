import { z } from "zod";
import { PLAN_TIERS, SIGNUP_OPTIONS } from "../../utils/merchantPlans";

// Business setup (the merchant's 8 steps) and paying for a plan at sign-up.

export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const COMPANY_SIZES = ["solo", "small-team", "multi-staff"] as const;

const text = (label: string, max: number) => z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must look like 09:00.");
const minutes = (label: string, max: number) => z.number({ error: `${label} must be a number.` }).int().min(0, `${label} can't be negative.`).max(max);

const bookingDay = z
  .object({ day: z.enum(WEEK_DAYS), isOpen: z.boolean().default(false), startTime: time.default("09:00"), endTime: time.default("17:00") })
  .refine((d) => !d.isOpen || d.startTime < d.endTime, { message: "Closing time must be after opening time.", path: ["endTime"] });

export const signupChoiceSchema = z.object({
  option: z.enum(SIGNUP_OPTIONS, { error: "Choose a plan to start: Trial, MVP or a paid plan." }),
  tier: z.enum(PLAN_TIERS).optional(),
  stripeSubscriptionId: z.string().trim().max(100).optional(),
});

export const createBusinessSchema = z.object({
  businessName: text("Business name", 120),
  description: z.string().trim().max(2000).optional().default(""),
  primaryAudience: text("Primary audience", 100),
  services: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  businessAddress: text("Business address", 300),
  /** ISO 3166-1 alpha-2, e.g. "AU". Optional now; needed before the first withdrawal. */
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose a country.").optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  companySize: z.enum(COMPANY_SIZES, { error: "Choose your team size." }),
  bookingPolicies: z.object({
    minimumLeadTime: minutes("Minimum lead time", 60 * 24 * 30),
    bufferTime: minutes("Buffer time", 60 * 24),
    cancellationWindow: minutes("Cancellation window", 24 * 30),
    // Saved in the salon's owner settings (Settings > Booking Rules), asked at sign-up.
    allowDoubleBookings: z.boolean().optional(),
    allowDepositPayment: z.boolean().optional(),
  }),
  bookingHours: z
    .array(bookingDay)
    .length(7, "Opening hours must cover all 7 days.")
    .refine((days) => new Set(days.map((d) => d.day)).size === 7, "Each day of the week must appear once."),
  howDidYouHear: z.array(z.string().trim().min(1).max(60)).min(1, "Tell us how you heard about us.").max(10),
  signup: signupChoiceSchema,
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const subscribeSchema = z.object({
  tier: z.enum(PLAN_TIERS, { error: "Choose a plan." }),
  paymentMethodId: z.string().trim().regex(/^pm_[A-Za-z0-9_]{6,64}$/, "We couldn't read that card. Please try again."),
  customerId: z.string().trim().regex(/^cus_[A-Za-z0-9]{8,64}$/, "That payment session is no longer valid. Please start again."),
});
