import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING_RULES, parseClockToMinutes, resolveBookingRules } from "../src/services/bookings/bookingRules";

describe("parseClockToMinutes", () => {
  it("reads 24-hour and 12-hour times", () => {
    expect(parseClockToMinutes("15:00")).toBe(900);
    expect(parseClockToMinutes("09:30:00")).toBe(570);
    expect(parseClockToMinutes("3:00 PM")).toBe(900);
    expect(parseClockToMinutes("12:15 am")).toBe(15);
    expect(parseClockToMinutes("12:00 PM")).toBe(720);
  });

  it("rejects anything else", () => {
    expect(parseClockToMinutes(null)).toBeNull();
    expect(parseClockToMinutes("")).toBeNull();
    expect(parseClockToMinutes("25:00")).toBeNull();
    expect(parseClockToMinutes("noon")).toBeNull();
  });
});

describe("resolveBookingRules", () => {
  it("uses the defaults when the salon has set nothing", () => {
    expect(resolveBookingRules({ policies: null, settings: null })).toEqual(DEFAULT_BOOKING_RULES);
  });

  it("prefers the policies row over the dashboard settings", () => {
    const rules = resolveBookingRules({
      policies: { minimumLeadTime: 120, bufferTime: 15 },
      settings: { minimumLeadTimeHours: 48, bufferMinutes: 30, maximumAdvanceDays: 30, sameDayCutoff: "16:00", allowDoubleBookings: true },
    });
    expect(rules).toEqual({
      minimumLeadMinutes: 120, bufferMinutes: 15, maximumAdvanceDays: 30, sameDayCutoffMinutes: 960, allowDoubleBookings: true,
    });
  });

  it("falls back to the settings, in hours, without a policies row", () => {
    const rules = resolveBookingRules({
      policies: null,
      settings: { minimumLeadTimeHours: 2, bufferMinutes: 10, maximumAdvanceDays: null, sameDayCutoff: null, allowDoubleBookings: null },
    });
    expect(rules).toMatchObject({ minimumLeadMinutes: 120, bufferMinutes: 10, maximumAdvanceDays: 90, allowDoubleBookings: false });
  });
});
