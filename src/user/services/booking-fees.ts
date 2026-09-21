/**
 * What the merchant is paid for a booking once KHS's commission and (for a
 * customer's first booking with that salon) acquisition fee are taken out.
 * Those fees come out of the merchant's payout; the customer is never charged
 * them. Never below zero.
 */
export function merchantNetAfterFees(
  paidTowardService: number,
  acquisitionFee: number,
  commission: number,
): number {
  return merchantPayout(paidTowardService, acquisitionFee, commission).credit;
}

/**
 * The payout for a booking: what to credit the merchant, and what is still owed to KHS when the
 * fees are larger than the amount paid (possible when a gift card paid most of the booking, since
 * the acquisition fee is worked out on the whole booking but only the card payment is held here).
 */
export function merchantPayout(
  paidTowardService: number,
  acquisitionFee: number,
  commission: number,
): { credit: number; shortfall: number } {
  const net =
    Math.round((Number(paidTowardService) - Number(acquisitionFee) - Number(commission)) * 100) / 100;
  return { credit: Math.max(0, net), shortfall: Math.max(0, -net) };
}

/** KHS's commission on an amount at a percentage rate, rounded to cents. */
export function commissionOn(amount: number, ratePercent: number): number {
  return Math.round(Number(amount) * (Number(ratePercent) || 0)) / 100;
}
