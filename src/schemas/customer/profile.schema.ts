import { z } from "zod";
import { GENDERS, personName, phoneNumber } from "../fields";

// The profile form and the address book.

/** YYYY-MM-DD, a real date in the past (no one is older than 120). */
const dateOfBirth = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter your date of birth as YYYY-MM-DD.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
    const age = (Date.now() - d.getTime()) / (365.25 * 86_400_000);
    return age > 0 && age < 120;
  }, "Please enter a real date of birth.");

/** Only the fields sent are changed; an empty phone number or date clears it. */
export const updateProfileSchema = z
  .object({
    firstName: personName("First name"),
    surname: personName("Surname"),
    phoneNumber: z.union([z.literal("").transform(() => null), phoneNumber()]),
    gender: z.enum(GENDERS, { error: "Please select a valid gender option." }),
    dateOfBirth: z.union([z.literal("").transform(() => null), z.null(), dateOfBirth]),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to update.");

export const ADDRESS_TYPES = ["Home", "Work"] as const;

export const addressSchema = z.object({
  type: z.enum(ADDRESS_TYPES, { error: "Choose Home or Work." }),
  fullAddress: z.string({ error: "Please enter the address." }).trim().min(1, "Please enter the address.").max(300, "The address must be 300 characters or fewer."),
});
