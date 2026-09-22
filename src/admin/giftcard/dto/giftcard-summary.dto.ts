// What the admin gift card page shows. "Sold" means paid for by a customer: cards a salon has listed
// but nobody has bought, and cards that were deleted, are never counted as money customers hold.
export class GiftCardSummaryDto {
  // Cards a customer has paid for (deleted ones excluded), and what they were worth when sold.
  soldCount: number;
  soldValue: number;
  // Of the sold cards, by state.
  activeCount: number;
  usedCount: number;
  expiredCount: number;
  inactiveCount: number;
  // What customers can still spend: the remaining balance on sold, active cards.
  balanceHeld: number;
  // What customers have already spent on sold cards (an expired card's balance is zeroed, so
  // only cards that haven't expired count).
  redeemedValue: number;
  // Cards nobody has bought yet (listed by a salon, or mid-checkout).
  unsoldCount: number;
  // Same as soldValue; kept so anything still reading the old field keeps working.
  totalAmount: number;
}
