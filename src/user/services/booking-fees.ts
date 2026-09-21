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
  const net = Number(paidTowardService) - Number(acquisitionFee) - Number(commission);
  return Math.max(0, Math.round(net * 100) / 100);
}
