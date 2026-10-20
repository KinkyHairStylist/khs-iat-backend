import { z } from "zod";
import { calendarDate, email, phoneNumber } from "../fields";

// The salon's team: profile, addresses, emergency contacts, services and settings.

const text = (label: string, max: number) => z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

export const STAFF_GENDERS = ["MALE", "FEMALE", "CUSTOM", "PREFER_NOT_TO_SAY"] as const;
export const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract"] as const;
export const STAFF_SETTINGS_ROLES = ["manager", "staff"] as const;

const address = z.object({
  name: text("Address name", 120),
  location: text("Location", 300),
  isPrimary: z.boolean().optional().default(false),
});

const emergencyContact = z.object({
  firstName: text("First name", 60),
  lastName: optionalText(60),
  relationship: optionalText(40),
  email: email(),
  phoneNumber: phoneNumber(),
});

export const staffSchema = z.object({
  firstName: text("First name", 60),
  lastName: text("Last name", 60),
  email: email(),
  gender: z.enum(STAFF_GENDERS, { error: "Choose a gender." }),
  dob: calendarDate("Please choose a valid date of birth.").optional().or(z.literal("").transform(() => undefined)),
  phoneNumber: phoneNumber(),
  jobTitle: optionalText(255),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional().or(z.literal("").transform(() => undefined)),
  avatar: z.string().trim().url("That photo isn't valid.").max(1000).nullable().optional(),
  addresses: z.array(address).max(10, "Add up to 10 addresses.").default([]),
  emergencyContacts: z.array(emergencyContact).max(10, "Add up to 10 contacts.").default([]),
  servicesAssigned: z.array(z.string().uuid("Please choose valid services.")).max(200).default([]).transform((ids) => [...new Set(ids)]),
  // Saved for when team members can sign in; "admin" can't be given from here.
  settings: z
    .object({
      role: z.enum(STAFF_SETTINGS_ROLES).default("staff"),
      permissions: z
        .object({
          configureSettings: z.boolean().default(false),
          assignBookings: z.boolean().default(true),
          manageServices: z.boolean().default(false),
          manageFinances: z.boolean().default(false),
        })
        .default({ configureSettings: false, assignBookings: true, manageServices: false, manageFinances: false }),
    })
    .default({ role: "staff", permissions: { configureSettings: false, assignBookings: true, manageServices: false, manageFinances: false } }),
  // Informational: what the merchant pays them outside the app (no staff wallets).
  commissionRate: z.number().min(0, "Commission can't be negative.").max(100, "Commission can be at most 100%.").nullable().optional(),
});
export type StaffInput = z.infer<typeof staffSchema>;

export const staffServicesSchema = z.object({
  serviceIds: z.array(z.string().uuid("Please choose valid services.")).max(200).transform((ids) => [...new Set(ids)]),
});

export const teamQuerySchema = z.object({ date: calendarDate("Dates look like 2026-01-31.") });
