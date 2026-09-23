import { BusinessGiftCardSoldStatus, BusinessGiftCardStatus, BusinessSentStatus } from '../enum/gift-card.enum';

export interface GiftCardSummaryRow {
  amount: number | string;
  remainingAmount: number | string;
  status: BusinessGiftCardStatus | string;
  soldStatus: BusinessGiftCardSoldStatus | string;
  sentStatus: BusinessSentStatus | string;
  expiresAt: Date | string;
}

export interface GiftCardSummary {
  totalCards: number;
  totalValue: number;
  totalRedeemedCards: number;
  totalSoldCards: number;
  totalPendingCards: number;
  totalAvailableCards: number;
  totalExpiredCards: number;
  totalRemainingValue: number;
  totalRedeemedValue: number;
}

// The merchant's gift-management dashboard shows these as top-line stats
// next to a list of the individual cards, so the numbers here have to match
// what that list actually shows.
export function summarizeGiftCards(cards: GiftCardSummaryRow[], now: Date = new Date()): GiftCardSummary {
  // "Total Gift Cards" means every (non-deleted) card the merchant has —
  // not just the ones that haven't expired yet. This used to count only
  // unexpired cards, so a merchant with any expired cards saw a "total"
  // lower than their actual card count.
  const totalCards = cards.length;

  const totalValue = cards.reduce((sum, c) => sum + (parseFloat(String(c.amount)) || 0), 0);
  const totalRemainingValue = cards.reduce((sum, c) => sum + (parseFloat(String(c.remainingAmount)) || 0), 0);
  const totalRedeemedValue = totalValue - totalRemainingValue;

  const totalRedeemedCards = cards.filter((c) => c.status === BusinessGiftCardStatus.USED).length;
  const totalPendingCards = cards.filter((c) => c.sentStatus === BusinessSentStatus.PENDING).length;
  const totalSoldCards = cards.filter((c) => c.soldStatus === BusinessGiftCardSoldStatus.PURCHASED).length;
  const totalAvailableCards = cards.filter(
    (c) => c.status === BusinessGiftCardStatus.ACTIVE && new Date(c.expiresAt) > now,
  ).length;

  // "Expired" used to be `status === EXPIRED || expiresAt <= now`, counting
  // a card as expired regardless of whether it had already been redeemed —
  // so a used card whose expiry date had since passed (its expiresAt is
  // never cleared on redemption) was counted in *both* Redeemed and
  // Expired, inflating the total shown above what the card list itself
  // added up to. A card already counted as redeemed is excluded here so
  // the two buckets stay mutually exclusive; still computed live off
  // expiresAt (not just the stored status) since the expiry sweep only
  // runs periodically and a card can be logically expired before it's
  // been swept.
  const totalExpiredCards = cards.filter(
    (c) =>
      c.status !== BusinessGiftCardStatus.USED &&
      (c.status === BusinessGiftCardStatus.EXPIRED || new Date(c.expiresAt) <= now),
  ).length;

  return {
    totalCards,
    totalValue: parseFloat(totalValue.toFixed(2)),
    totalRedeemedCards,
    totalSoldCards,
    totalPendingCards,
    totalAvailableCards,
    totalExpiredCards,
    totalRemainingValue: parseFloat(totalRemainingValue.toFixed(2)),
    totalRedeemedValue: parseFloat(totalRedeemedValue.toFixed(2)),
  };
}
