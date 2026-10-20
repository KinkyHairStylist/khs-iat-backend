import { z } from "zod";
import { weekHoursSchema } from "./setup.schema";

// Settings > Notifications, Booking rules, Cancellation, Deposit and Business.
// Only what each form changes is accepted (never connected-app flags or keys).

export const notificationSettingsSchema = z.object({
  newBookingAlerts: z.boolean(),
  cancellationAlerts: z.boolean(),
});

export const bookingRulesSchema = z.object({
  minimumLeadTimeMinutes: z.number().int().min(0).max(60 * 24 * 30, "At most 30 days' notice."),
  bufferTimeBetweenAppointmentsMinutes: z.number().int().min(0).max(240, "At most 4 hours between appointments."),
  maximumAdvanceBookingDays: z.number().int().min(1, "At least 1 day.").max(365, "At most 365 days."),
  // "" = no cut-off.
  sameDayBookingCutoff: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time like 17:00.")]),
  allowDoubleBookings: z.boolean(),
});
export type BookingRulesInput = z.infer<typeof bookingRulesSchema>;

export const cancellationWindowSchema = z.object({
  cancellationWindow: z.number({ error: "Enter a number of hours." }).int("Use whole hours.").min(0).max(24 * 30, "At most 30 days (720 hours)."),
});

export const depositSettingSchema = z.object({ allowDepositPayment: z.boolean() });

export const businessInfoSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name.").max(120),
  description: z.string().trim().max(2000).default(""),
  revenueGoal: z.number().min(0).max(100_000_000).nullable().optional(),
});

export const businessHoursSchema = z.object({ bookingDays: weekHoursSchema });

export const businessLocationSchema = z.object({
  businessAddress: z.string().trim().min(5, "Enter the full address.").max(300),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Choose a country.").optional(),
});

export const galleryImageSchema = z.object({ url: z.string().url().max(1000) });
