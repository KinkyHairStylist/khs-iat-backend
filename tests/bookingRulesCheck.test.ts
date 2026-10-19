import { describe, expect, it } from "vitest";
import { checkBookingAgainstRules, parseDurationToMinutes, wallClockMs, wallClockNowMs } from "../src/services/bookings/bookingRulesCheck";
import { DEFAULT_BOOKING_RULES } from "../src/services/bookings/bookingRules";

const rules = { ...DEFAULT_BOOKING_RULES, minimumLeadMinutes: 60 };
const now = wallClockMs("2026-10-19", "8:00 AM")!;

describe("checkBookingAgainstRules", () => {
  it("accepts a free slot within the rules", () => {
    expect(checkBookingAgainstRules({ rules, date: "2026-10-20", time: "9:00 AM", durationMinutes: 60, nowWallClockMs: now })).toBeNull();
  });
  it("needs the minimum notice", () => {
    expect(checkBookingAgainstRules({ rules, date: "2026-10-19", time: "8:30 AM", durationMinutes: 30, nowWallClockMs: now })).toMatch(/1 hour notice/);
  });
  it("refuses too far ahead", () => {
    expect(checkBookingAgainstRules({ rules, date: "2027-03-01", time: "9:00 AM", durationMinutes: 30, nowWallClockMs: now })).toMatch(/90 days ahead/);
  });
  it("applies the same-day cutoff", () => {
    const r = { ...rules, minimumLeadMinutes: 0, sameDayCutoffMinutes: 7 * 60 };
    expect(checkBookingAgainstRules({ rules: r, date: "2026-10-19", time: "3:00 PM", durationMinutes: 30, nowWallClockMs: now })).toMatch(/close at 7:00 AM/);
  });
  it("refuses an overlap, with the buffer, when double bookings are off", () => {
    const r = { ...rules, bufferMinutes: 15 };
    const existing = [{ date: "2026-10-20", time: "10:00 AM", duration: "60" }];
    expect(checkBookingAgainstRules({ rules: r, date: "2026-10-20", time: "11:00 AM", durationMinutes: 30, nowWallClockMs: now, existing })).toMatch(/no longer available/);
    expect(checkBookingAgainstRules({ rules: r, date: "2026-10-20", time: "11:15 AM", durationMinutes: 30, nowWallClockMs: now, existing })).toBeNull();
    expect(checkBookingAgainstRules({ rules: { ...r, allowDoubleBookings: true }, date: "2026-10-20", time: "10:00 AM", durationMinutes: 30, nowWallClockMs: now, existing })).toBeNull();
  });
  it("rejects an unreadable time", () => {
    expect(checkBookingAgainstRules({ rules, date: "2026-10-20", time: "noon", durationMinutes: 30, nowWallClockMs: now })).toMatch(/valid date/);
  });
});

describe("helpers", () => {
  it("parses durations like the calendar", () => {
    expect(parseDurationToMinutes("1 hr 30 mins")).toBe(90);
    expect(parseDurationToMinutes("60")).toBe(60);
    expect(parseDurationToMinutes(undefined)).toBe(30);
  });
  it("shifts now into the customer's timezone", () => {
    const utc = Date.UTC(2026, 9, 19, 0, 0);
    expect(wallClockNowMs(-600, utc) - utc).toBe(600 * 60_000); // Sydney, UTC+10
  });
});
