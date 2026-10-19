// What a customer pays for a booking, worked out in whole cents so totals
// never drift (0.1 + 0.2). Same rules as Kinky-Hair-Stylist-BE-Redesign:
//  - KHS's commission and acquisition fee come out of the salon's payout,
//    never the customer's pocket.
//  - Paying by card adds the card processing fee (rate % + fixed), worked out
//    on what actually goes through the card.
//  - A deposit is half the service price; the rest is paid at the salon. It
//    can't be combined with a gift card.
//  - A gift card pays first; the card pays what's left.

export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number) => cents / 100;

// Stripe refuses a charge under 50 cents (in AUD/USD).
export const MIN_CARD_CHARGE_CENTS = 50;

export interface QuoteInput {
  serviceTotalCents: number;
  /** What's left on the gift card being applied, if any. */
  giftCardBalanceCents?: number;
  depositOnly?: boolean;
  passthroughRate: number;
  passthroughFixedFee: number;
}

export interface PaymentQuote {
  serviceTotalCents: number;
  giftCardAppliedCents: number;
  /** The part of the service price paid by card now (all of the rest, or the deposit). */
  cardBaseCents: number;
  processingFeeCents: number;
  /** Charged to the card now: cardBase + processing fee. */
  cardChargeCents: number;
  /** Paid at the salon (the other half of a deposit booking). */
  balanceDueCents: number;
}

/** The card processing fee on `baseCents`, rounded to the cent. None on nothing. */
export function processingFeeCents(baseCents: number, rate: number, fixedFee: number): number {
  if (baseCents <= 0) return 0;
  return Math.round((baseCents * rate) / 100 + fixedFee * 100);
}

export function quotePayment(input: QuoteInput): PaymentQuote {
  const total = Math.max(0, input.serviceTotalCents);
  const giftCardAppliedCents = input.depositOnly ? 0 : Math.min(Math.max(0, input.giftCardBalanceCents ?? 0), total);
  const remaining = total - giftCardAppliedCents;
  const cardBaseCents = input.depositOnly ? Math.round(total / 2) : remaining;
  const fee = processingFeeCents(cardBaseCents, input.passthroughRate, input.passthroughFixedFee);
  return {
    serviceTotalCents: total,
    giftCardAppliedCents,
    cardBaseCents,
    processingFeeCents: fee,
    cardChargeCents: cardBaseCents + fee,
    balanceDueCents: input.depositOnly ? total - cardBaseCents : 0,
  };
}

/** KHS's fees on a booking, taken from the salon: commission always, acquisition on a first booking. */
export function salonFeesCents(serviceTotalCents: number, commissionRate: number, acquisitionRate: number) {
  return {
    commissionCents: Math.round((serviceTotalCents * commissionRate) / 100),
    acquisitionCents: Math.round((serviceTotalCents * acquisitionRate) / 100),
  };
}
