// A salon's scheduling rules as the booking calendar applies them (all in
// minutes). Ported from Kinky-Hair-Stylist-BE-Redesign's booking-rules helper
// so both apps offer the same time slots.

export interface BookingRules {
  minimumLeadMinutes: number;
  bufferMinutes: number;
  maximumAdvanceDays: number;
  sameDayCutoffMinutes: number | null;
  allowDoubleBookings: boolean;
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  minimumLeadMinutes: 24 * 60,
  bufferMinutes: 0,
  maximumAdvanceDays: 90,
  sameDayCutoffMinutes: null,
  allowDoubleBookings: false,
};

/** "15:00", "15:00:00", "3:00 PM" → minutes since midnight, or null. */
export function parseClockToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export interface BookingRuleSources {
  /** booking_policies, written by the sign-up wizard and Settings > Booking Rules. */
  policies: { minimumLeadTime: number; bufferTime: number } | null;
  /** business_owner_settings — the dashboard values, used where there's no policies row. */
  settings: {
    minimumLeadTimeHours: number | null;
    bufferMinutes: number | null;
    maximumAdvanceDays: number | null;
    sameDayCutoff: string | null;
    allowDoubleBookings: boolean | null;
  } | null;
}

/** The rules a salon's bookings follow: its policies first, then its settings, then the defaults. */
export function resolveBookingRules({ policies, settings }: BookingRuleSources): BookingRules {
  const d = DEFAULT_BOOKING_RULES;
  const leadFromSettings = settings?.minimumLeadTimeHours != null ? settings.minimumLeadTimeHours * 60 : null;
  return {
    minimumLeadMinutes: policies?.minimumLeadTime ?? leadFromSettings ?? d.minimumLeadMinutes,
    bufferMinutes: policies?.bufferTime ?? settings?.bufferMinutes ?? d.bufferMinutes,
    maximumAdvanceDays: settings?.maximumAdvanceDays ?? d.maximumAdvanceDays,
    sameDayCutoffMinutes: parseClockToMinutes(settings?.sameDayCutoff),
    allowDoubleBookings: settings?.allowDoubleBookings === true,
  };
}
