import { z } from "zod";

// A salon's membership package: a number of sessions of one of its services,
// paid up front, used within so many days of buying.
export const membershipPackageSchema = z.object({
  serviceId: z.string().uuid("Choose a service."),
  pricePerSession: z
    .number({ error: "Enter a price per session." })
    .positive("The price per session must be more than 0.")
    .max(100_000, "That price is too high.")
    .refine((v) => Math.round(v * 100) === Math.round(v * 100 * 1e6) / 1e6, "Use at most 2 decimal places."),
  sessionCount: z.number({ error: "Enter the number of sessions." }).int("Sessions must be a whole number.").min(1, "At least 1 session.").max(500, "At most 500 sessions."),
  expiryDays: z.number().int().min(1, "At least 1 day.").max(1095, "At most 3 years.").optional().default(365),
});
export type MembershipPackageInput = z.infer<typeof membershipPackageSchema>;
