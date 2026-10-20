import { z } from "zod";
import { calendarDate, email } from "../fields";

// The salon's client records: list filters, the profile form (profile,
// addresses, emergency contacts, settings in one), and photos.

const text = (label: string, max: number) => z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) => z.union([schema, z.literal("").transform(() => undefined)]).optional();

const phoneCode = z.string().trim().regex(/^\+\d{1,4}$/, "Choose a country code.");
const phoneDigits = (label: string) => z.string().trim().transform((v) => v.replace(/\D/g, "")).pipe(z.string().min(6, `${label} must have at least 6 digits.`).max(15, `${label} is too long.`));

export const CLIENT_GENDERS = ["MALE", "FEMALE", "CUSTOM", "PREFER_NOT_TO_SAY"] as const;
export const CLIENT_PRONOUNS = ["he-him", "she-her", "they-them", "other"] as const;
export const CLIENT_SOURCES = ["walk-in", "referral", "instagram", "website", "facebook", "other"] as const;
export const CONTACT_METHODS = ["email", "sms", "phone"] as const;

const address = z.object({
  addressName: text("Address name", 120),
  addressLine2: optional(200),
  location: text("Location", 300),
  city: optional(100),
  state: optional(100),
  zipCode: optional(20),
  country: optional(100),
});

const contact = z.object({
  firstName: text("First name", 60),
  lastName: optional(60),
  email: email(),
  relationship: text("Relationship", 40),
  phone: phoneDigits("Phone number"),
  phoneCode,
});

export const clientSchema = z.object({
  firstName: text("First name", 60),
  lastName: text("Last name", 60),
  email: email(),
  phone: phoneDigits("Phone number"),
  phoneCode,
  dateOfBirth: blankToUndefined(calendarDate("Please choose a valid date of birth.")),
  gender: z.enum(CLIENT_GENDERS, { error: "Choose a gender." }),
  pronouns: z.enum(CLIENT_PRONOUNS, { error: "Choose pronouns." }),
  occupation: optional(100),
  clientSource: z.enum(CLIENT_SOURCES).default("walk-in"),
  // Set by POST /merchant/clients/images (this salon's folder), or the photo it already had.
  profileImage: z.string().trim().url("That photo isn't valid.").max(1000).nullable().optional(),
  addresses: z.array(address).max(2, "Add up to 2 addresses.").default([]),
  emergencyContacts: z.array(contact).max(2, "Add up to 2 emergency contacts.").default([]),
  settings: z
    .object({
      emailNotifications: z.boolean().default(true),
      smsNotifications: z.boolean().default(true),
      marketingEmails: z.boolean().default(false),
      notes: z.string().trim().max(2000).optional().default(""),
      preferredContactMethod: blankToUndefined(z.enum(CONTACT_METHODS)),
      language: blankToUndefined(z.string().trim().regex(/^[a-z]{2}$/, "Choose a language.")),
      timezone: blankToUndefined(z.string().trim().max(60)),
    })
    .default({ emailNotifications: true, smsNotifications: true, marketingEmails: false, notes: "" }),
});
export type ClientInput = z.infer<typeof clientSchema>;

export const CLIENT_SORTS = ["newest", "oldest", "nameAsc", "nameDesc"] as const;
export const clientListQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  segment: z.enum(["all", "members", "regular", "new"]).catch("all"),
  sort: z.enum(CLIENT_SORTS).catch("newest"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  // 200 lets the page export every match in a few requests.
  limit: z.coerce.number().int().min(1).max(200).catch(9),
  date: calendarDate("Dates look like 2026-01-31."),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

export const clientOverviewQuerySchema = z.object({
  period: z.enum(["week", "month", "year"]).catch("week"),
  date: calendarDate("Dates look like 2026-01-31."),
});

export const reviewReplySchema = z.object({ reply: text("Your response", 2000) });
