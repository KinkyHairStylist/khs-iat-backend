import { describe, expect, it } from "vitest";
import { giftCardRefusal } from "../src/services/customer/giftCardsService";
import { createBookingSchema } from "../src/schemas/bookings.schema";

const card = { id: "1", code: "X", businessId: "s1", remainingAmount: "40.00", status: "Active", soldStatus: "purchased", expiresAt: new Date(Date.now() + 86_400_000) };

describe("giftCardRefusal", () => {
  it("accepts a live card at its own salon", () => expect(giftCardRefusal(card, "s1")).toBeNull());
  it("refuses another salon, unsold, used up, expired, inactive or missing", () => {
    expect(giftCardRefusal(card, "s2")?.reasonCode).toBe("wrong_salon");
    expect(giftCardRefusal({ ...card, soldStatus: "available" }, "s1")).not.toBeNull();
    expect(giftCardRefusal({ ...card, remainingAmount: "0" }, "s1")).not.toBeNull();
    expect(giftCardRefusal({ ...card, expiresAt: new Date(Date.now() - 1000) }, "s1")).not.toBeNull();
    expect(giftCardRefusal({ ...card, status: "Inactive" }, "s1")).not.toBeNull();
    expect(giftCardRefusal(null, "s1")).not.toBeNull();
  });
});

describe("createBookingSchema", () => {
  const ok = {
    salonId: "f58a4952-fdf8-4a80-8fdb-cd8131c63f2b",
    serviceIds: ["7e78ac52-8f63-4b2b-8bf4-dc532cc9cbd1", "7e78ac52-8f63-4b2b-8bf4-dc532cc9cbd1"],
    date: "2026-10-20",
    time: "9:30 AM",
  };
  it("dedupes services and accepts the calendar's time format", () => {
    expect(createBookingSchema.parse(ok).serviceIds).toHaveLength(1);
  });
  it("rejects impossible dates and 24-hour times", () => {
    expect(createBookingSchema.safeParse({ ...ok, date: "2026-02-30" }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...ok, time: "14:00" }).success).toBe(false);
  });
});
