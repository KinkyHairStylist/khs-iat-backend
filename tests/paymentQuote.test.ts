import { describe, expect, it } from "vitest";
import { processingFeeCents, quotePayment, salonFeesCents } from "../src/services/bookings/paymentQuote";

const rates = { passthroughRate: 1.75, passthroughFixedFee: 0.3 };

describe("quotePayment", () => {
  it("full card payment adds the processing fee on top", () => {
    // $100: fee = 1.75 + 0.30 = 2.05
    expect(quotePayment({ serviceTotalCents: 10_000, ...rates })).toEqual({
      serviceTotalCents: 10_000, giftCardAppliedCents: 0, cardBaseCents: 10_000, processingFeeCents: 205, cardChargeCents: 10_205, balanceDueCents: 0,
    });
  });

  it("a deposit is half the price; the rest is due at the salon", () => {
    const q = quotePayment({ serviceTotalCents: 25_000, depositOnly: true, ...rates });
    expect(q.cardBaseCents).toBe(12_500);
    expect(q.processingFeeCents).toBe(249); // 218.75 + 30
    expect(q.balanceDueCents).toBe(12_500);
  });

  it("rounds an odd deposit and keeps the halves adding up", () => {
    const q = quotePayment({ serviceTotalCents: 3_501, depositOnly: true, ...rates });
    expect(q.cardBaseCents + q.balanceDueCents).toBe(3_501);
  });

  it("a gift card pays first, the card the rest", () => {
    const q = quotePayment({ serviceTotalCents: 10_000, giftCardBalanceCents: 4_000, ...rates });
    expect(q.giftCardAppliedCents).toBe(4_000);
    expect(q.cardBaseCents).toBe(6_000);
    expect(q.cardChargeCents).toBe(6_000 + processingFeeCents(6_000, 1.75, 0.3));
  });

  it("a gift card covering everything leaves nothing for the card, and no fee", () => {
    const q = quotePayment({ serviceTotalCents: 5_000, giftCardBalanceCents: 9_000, ...rates });
    expect(q).toMatchObject({ giftCardAppliedCents: 5_000, cardBaseCents: 0, processingFeeCents: 0, cardChargeCents: 0 });
  });

  it("ignores a gift card with a deposit", () => {
    expect(quotePayment({ serviceTotalCents: 10_000, giftCardBalanceCents: 5_000, depositOnly: true, ...rates }).giftCardAppliedCents).toBe(0);
  });
});

describe("salonFeesCents", () => {
  it("works out commission and acquisition on the whole booking", () => {
    expect(salonFeesCents(10_000, 12, 10)).toEqual({ commissionCents: 1_200, acquisitionCents: 1_000 });
    expect(salonFeesCents(3_333, 12, 0)).toEqual({ commissionCents: 400, acquisitionCents: 0 });
  });
});
