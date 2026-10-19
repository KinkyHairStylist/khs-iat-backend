import prisma from "../../lib/prisma/prisma";

export interface CustomerPreferences {
  language: string;
  timeZone: string;
  profileVisibility: boolean;
  locationServices: boolean;
}

// What a customer who never saved preferences gets (the table's own defaults).
const DEFAULTS: CustomerPreferences = { language: "en", timeZone: "UTC", profileVisibility: true, locationServices: true };

/** The customer's app preferences (Settings → Preferences), or the defaults. */
export async function getPreferences(userId: string): Promise<CustomerPreferences> {
  const row = await prisma.user_preferences.findUnique({ where: { userId } });
  if (!row) return DEFAULTS;
  return {
    language: row.language,
    timeZone: row.time_zone,
    profileVisibility: row.profile_visibility,
    locationServices: row.location_services,
  };
}
