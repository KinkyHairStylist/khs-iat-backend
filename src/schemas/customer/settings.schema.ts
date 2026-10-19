import { z } from "zod";
import { currentPassword, newPassword } from "../fields";

// Settings: preferences, notification switches, password.

/** Whether the runtime knows this IANA time zone (e.g. "Australia/Sydney"). */
function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value.length <= 64;
  } catch {
    return false;
  }
}

/** Only the fields sent are changed. Language lives in the browser (the column only knows en/es/fr). */
export const updatePreferencesSchema = z
  .object({
    timeZone: z.string().trim().refine(isTimeZone, "Please choose a time zone from the list."),
    profileVisibility: z.boolean(),
    locationServices: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

export const NOTIFICATION_SETTING_KEYS = [
  "emailBookingConfirmations",
  "emailAppointmentReminders",
  "emailMarketingPromotions",
  "emailSpecialOffers",
  "emailNewSalonAlerts",
  "smsBookingConfirmations",
  "smsAppointmentReminders",
  "smsMarketingPromotions",
  "smsSpecialOffers",
  "smsNewSalonAlerts",
] as const;

export const updateNotificationSettingsSchema = z
  .object(Object.fromEntries(NOTIFICATION_SETTING_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof NOTIFICATION_SETTING_KEYS)[number], z.ZodBoolean>)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

export const changePasswordSchema = z
  .object({ currentPassword: currentPassword(), newPassword: newPassword() })
  .refine((v) => v.currentPassword !== v.newPassword, { message: "Your new password must be different from the current one.", path: ["newPassword"] });
