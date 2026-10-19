import prisma from "../../lib/prisma/prisma";
import type { z } from "zod";
import { NOTIFICATION_SETTING_KEYS, type updateNotificationSettingsSchema, type updatePreferencesSchema } from "../../schemas/customer/settings.schema";
import { getPreferences } from "./preferencesService";

// Settings → preferences and notification switches. Both rows are created on
// first save; until then the table defaults apply.

export async function updatePreferences(userId: string, input: z.infer<typeof updatePreferencesSchema>) {
  const data = {
    ...(input.timeZone !== undefined ? { time_zone: input.timeZone } : {}),
    ...(input.profileVisibility !== undefined ? { profile_visibility: input.profileVisibility } : {}),
    ...(input.locationServices !== undefined ? { location_services: input.locationServices } : {}),
  };
  await prisma.user_preferences.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  return getPreferences(userId);
}

type NotificationSettings = Record<(typeof NOTIFICATION_SETTING_KEYS)[number], boolean>;

const SETTINGS_SELECT = Object.fromEntries(NOTIFICATION_SETTING_KEYS.map((k) => [k, true])) as Record<keyof NotificationSettings, true>;

// The table's own defaults: booking emails on, everything else off.
const DEFAULT_SETTINGS = Object.fromEntries(
  NOTIFICATION_SETTING_KEYS.map((k) => [k, k === "emailBookingConfirmations" || k === "emailAppointmentReminders"]),
) as NotificationSettings;

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  return (await prisma.user_notification_settings.findUnique({ where: { userId }, select: SETTINGS_SELECT })) ?? DEFAULT_SETTINGS;
}

export async function updateNotificationSettings(userId: string, input: z.infer<typeof updateNotificationSettingsSchema>): Promise<NotificationSettings> {
  return prisma.user_notification_settings.upsert({ where: { userId }, update: input, create: { userId, ...input }, select: SETTINGS_SELECT });
}
