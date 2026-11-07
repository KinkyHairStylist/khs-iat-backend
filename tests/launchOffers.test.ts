import { describe, expect, it, vi } from "vitest";

// The pure parts of the launch offers; nothing here touches the database.
vi.mock("../src/lib/prisma/prisma", () => ({ default: {} }));
import { addMonths, firstBookingDiscountCents, foundingStatus } from "../src/services/offers/launchOffers";
import { quotePayment } from "../src/services/bookings/paymentQuote";

const settings = { foundingSalonLimit: 100, foundingCommissionFreeMonths: 2, launchDate: "2027-01-01" };
const at = (iso: string) => new Date(iso);

describe("founding stylist offer", () => {
  it("a salon approved before launch gets its 2 free months from launch", () => {
    const s = foundingStatus({ foundingNumber: 7, approvedAt: at("2026-11-07T10:00:00Z") }, settings, at("2026-12-15T00:00:00Z"));
    expect(s.isFounding).toBe(true);
    expect(s.startsAt?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(s.endsAt?.toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(s.active).toBe(false); // not open yet: commission doesn't apply before launch either
  });

  it("runs from launch until 2 months later", () => {
    const business = { foundingNumber: 7, approvedAt: at("2026-11-07T10:00:00Z") };
    expect(foundingStatus(business, settings, at("2027-01-01T00:00:00Z")).active).toBe(true);
    expect(foundingStatus(business, settings, at("2027-02-28T23:59:59Z")).active).toBe(true);
    expect(foundingStatus(business, settings, at("2027-03-01T00:00:00Z")).active).toBe(false);
  });

  it("a salon approved after launch gets 2 months from its approval", () => {
    const s = foundingStatus({ foundingNumber: 60, approvedAt: at("2027-03-10T09:30:00Z") }, settings, at("2027-04-01T00:00:00Z"));
    expect(s.startsAt?.toISOString()).toBe("2027-03-10T09:30:00.000Z");
    expect(s.endsAt?.toISOString()).toBe("2027-05-10T09:30:00.000Z");
    expect(s.active).toBe(true);
  });

  it("salons without a founding number, or past the limit, don't get it", () => {
    expect(foundingStatus({ foundingNumber: null, approvedAt: at("2027-01-05T00:00:00Z") }, settings, at("2027-01-10T00:00:00Z")).isFounding).toBe(false);
    expect(foundingStatus({ foundingNumber: 101, approvedAt: at("2027-01-05T00:00:00Z") }, settings, at("2027-01-10T00:00:00Z")).isFounding).toBe(false);
  });

  it("adds calendar months without spilling into the next month", () => {
    expect(addMonths(at("2027-12-31T08:00:00Z"), 2).toISOString()).toBe("2028-02-29T08:00:00.000Z");
    expect(addMonths(at("2027-01-31T00:00:00Z"), 1).toISOString()).toBe("2027-02-28T00:00:00.000Z");
  });
});

describe("first-booking discount", () => {
  const rates = { passthroughRate: 1.75, passthroughFixedFee: 0.3 };

  it("is 3% of the service price", () => {
    expect(firstBookingDiscountCents(10_000, 3)).toBe(300);
    expect(firstBookingDiscountCents(4_550, 3)).toBe(137); // 136.5 rounds up
    expect(firstBookingDiscountCents(0, 3)).toBe(0);
  });

  it("comes off the card payment, and the processing fee is on what's actually charged", () => {
    const q = quotePayment({ serviceTotalCents: 10_000, discountCents: 300, ...rates });
    expect(q.discountCents).toBe(300);
    expect(q.cardBaseCents).toBe(9_700);
    expect(q.processingFeeCents).toBe(200); // 1.75% of 97.00 = 1.70 (rounded) + 0.30
    expect(q.cardChargeCents).toBe(9_900);
  });

  it("on a deposit, comes off the deposit; what's paid at the salon is unchanged", () => {
    const q = quotePayment({ serviceTotalCents: 25_000, depositOnly: true, discountCents: 750, ...rates });
    expect(q.cardBaseCents).toBe(12_500 - 750);
    expect(q.balanceDueCents).toBe(12_500);
  });

  it("never takes the card payment below zero", () => {
    const q = quotePayment({ serviceTotalCents: 100, discountCents: 500, ...rates });
    expect(q.discountCents).toBe(100);
    expect(q.cardBaseCents).toBe(0);
  });
});
