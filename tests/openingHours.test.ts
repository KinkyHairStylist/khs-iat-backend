import { describe, expect, it } from "vitest";
import { openWindow, openingHoursProblem, salonBlocked, weekdayOf } from "../src/services/bookings/openingHours";

const hours = [
  { day: "Wednesday", isOpen: true, startTime: "09:00:00", endTime: "17:00:00" },
  { day: "Sunday", isOpen: false, startTime: "09:00:00", endTime: "17:00:00" },
];

describe("opening hours", () => {
  it("reads the weekday from the date itself", () => {
    expect(weekdayOf("2026-10-21")).toBe("Wednesday");
    expect(weekdayOf("2026-10-25")).toBe("Sunday");
    expect(weekdayOf("nope")).toBeNull();
  });

  it("gives the open window, or null when closed or unset", () => {
    expect(openWindow(hours, "2026-10-21")).toEqual({ open: 540, close: 1020 });
    expect(openWindow(hours, "2026-10-25")).toBeNull();
    expect(openWindow(hours, "2026-10-22")).toBeNull();
  });

  it("refuses closed days and times running past closing", () => {
    expect(openingHoursProblem(hours, "2026-10-21", 9 * 60, 60)).toBeNull();
    expect(openingHoursProblem(hours, "2026-10-21", 16 * 60 + 30, 60)).toMatch(/opening hours/);
    expect(openingHoursProblem(hours, "2026-10-21", 8 * 60, 30)).toMatch(/opening hours/);
    expect(openingHoursProblem(hours, "2026-10-25", 10 * 60, 30)).toMatch(/closed on Sundays/);
  });

  it("doesn't hold a salon with no hours set to any", () => {
    expect(openingHoursProblem([], "2026-10-25", 3 * 60, 30)).toBeNull();
  });
});

describe("salon-wide blocked time", () => {
  const blocks = [
    { startTime: "12:00:00", endTime: "13:00:00", teamMember: "" },
    { startTime: "15:00:00", endTime: "16:00:00", teamMember: "Bea Top" },
  ];
  it("blocks overlapping slots for everyone, not one person's block", () => {
    expect(salonBlocked(blocks, 11 * 60 + 30, 60)).toBe(true);
    expect(salonBlocked(blocks, 13 * 60, 30)).toBe(false);
    expect(salonBlocked(blocks, 15 * 60, 30)).toBe(false);
    expect(salonBlocked([{ startTime: "10:00", endTime: "11:00", teamMember: "All Team Members" }], 10 * 60, 30)).toBe(true);
  });
});
