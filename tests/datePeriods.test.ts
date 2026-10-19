import { describe, expect, it } from "vitest";
import { growth, monthOf, periodBounds, weekOf } from "../src/utils/datePeriods";

describe("periodBounds", () => {
  it("today vs yesterday, across a month end", () => {
    expect(periodBounds("today", "2026-03-01")).toEqual({ current: { start: "2026-03-01", end: "2026-03-01" }, previous: { start: "2026-02-28", end: "2026-02-28" } });
  });
  it("week runs Sunday to Saturday, previous week before it", () => {
    // 2026-10-18 is a Sunday.
    expect(periodBounds("week", "2026-10-21")).toEqual({ current: { start: "2026-10-18", end: "2026-10-24" }, previous: { start: "2026-10-11", end: "2026-10-17" } });
  });
  it("month and the month before, including a leap February", () => {
    expect(periodBounds("month", "2028-03-15")).toEqual({ current: { start: "2028-03-01", end: "2028-03-31" }, previous: { start: "2028-02-01", end: "2028-02-29" } });
  });
  it("January's previous month is last December", () => {
    expect(periodBounds("month", "2027-01-10").previous).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });
});

describe("weekOf / monthOf", () => {
  it("a week can cross a year", () => expect(weekOf("2027-01-01")).toEqual({ start: "2026-12-27", end: "2027-01-02" }));
  it("month end", () => expect(monthOf("2026-11-30")).toEqual({ start: "2026-11-01", end: "2026-11-30" }));
});

describe("growth", () => {
  it("from nothing", () => {
    expect(growth(0, 0)).toEqual({ percent: 0, text: "0%", type: "neutral" });
    expect(growth(5, 0)).toEqual({ percent: 100, text: "New", type: "increase" });
  });
  it("up, down, flat", () => {
    expect(growth(150, 100).text).toBe("+50%");
    expect(growth(75, 100)).toEqual({ percent: -25, text: "-25%", type: "decrease" });
    expect(growth(100, 100).type).toBe("neutral");
  });
});
