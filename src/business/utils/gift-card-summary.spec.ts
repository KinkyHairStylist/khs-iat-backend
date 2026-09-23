import { BusinessGiftCardSoldStatus, BusinessGiftCardStatus, BusinessSentStatus } from '../enum/gift-card.enum';
import { GiftCardSummaryRow, summarizeGiftCards } from './gift-card-summary';

const NOW = new Date('2026-09-23T00:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2027-01-01T00:00:00Z');

const card = (overrides: Partial<GiftCardSummaryRow>): GiftCardSummaryRow => ({
  amount: 100,
  remainingAmount: 100,
  status: BusinessGiftCardStatus.ACTIVE,
  soldStatus: BusinessGiftCardSoldStatus.AVAILABLE,
  sentStatus: BusinessSentStatus.PENDING,
  expiresAt: FUTURE,
  ...overrides,
});

describe('summarizeGiftCards', () => {
  it('counts every non-deleted card as the total, including expired ones', () => {
    const s = summarizeGiftCards(
      [
        card({ status: BusinessGiftCardStatus.ACTIVE, expiresAt: FUTURE }),
        card({ status: BusinessGiftCardStatus.ACTIVE, expiresAt: PAST }),
        card({ status: BusinessGiftCardStatus.EXPIRED, expiresAt: PAST }),
      ],
      NOW,
    );
    expect(s.totalCards).toBe(3);
  });

  it('does not double-count a redeemed card whose expiry date has since passed as also Expired', () => {
    const s = summarizeGiftCards(
      [
        card({
          status: BusinessGiftCardStatus.USED,
          remainingAmount: 0,
          expiresAt: PAST, // expiresAt is never cleared on redemption
        }),
      ],
      NOW,
    );
    expect(s.totalRedeemedCards).toBe(1);
    expect(s.totalExpiredCards).toBe(0);
  });

  it('counts an unredeemed card past its expiry as Expired, even before the sweep cron has relabeled it', () => {
    const s = summarizeGiftCards(
      [card({ status: BusinessGiftCardStatus.ACTIVE, expiresAt: PAST })],
      NOW,
    );
    expect(s.totalExpiredCards).toBe(1);
    expect(s.totalAvailableCards).toBe(0);
  });

  it('counts a card already relabeled Expired by the sweep cron', () => {
    const s = summarizeGiftCards(
      [card({ status: BusinessGiftCardStatus.EXPIRED, expiresAt: PAST })],
      NOW,
    );
    expect(s.totalExpiredCards).toBe(1);
  });

  it('every card lands in exactly one of Redeemed/Available/Expired for a simple mixed set', () => {
    const cards = [
      card({ status: BusinessGiftCardStatus.ACTIVE, expiresAt: FUTURE }), // available
      card({ status: BusinessGiftCardStatus.ACTIVE, expiresAt: PAST }), // expired (unswept)
      card({ status: BusinessGiftCardStatus.EXPIRED, expiresAt: PAST }), // expired (swept)
      card({ status: BusinessGiftCardStatus.USED, remainingAmount: 0, expiresAt: PAST }), // redeemed
    ];
    const s = summarizeGiftCards(cards, NOW);
    expect(s.totalAvailableCards + s.totalExpiredCards + s.totalRedeemedCards).toBe(cards.length);
  });

  it('computes value totals correctly', () => {
    const s = summarizeGiftCards(
      [
        card({ amount: 100, remainingAmount: 40 }),
        card({ amount: 50, remainingAmount: 50 }),
      ],
      NOW,
    );
    expect(s.totalValue).toBe(150);
    expect(s.totalRemainingValue).toBe(90);
    expect(s.totalRedeemedValue).toBe(60);
  });

  it('has nothing to show for a business with no cards', () => {
    expect(summarizeGiftCards([], NOW)).toEqual({
      totalCards: 0,
      totalValue: 0,
      totalRedeemedCards: 0,
      totalSoldCards: 0,
      totalPendingCards: 0,
      totalAvailableCards: 0,
      totalExpiredCards: 0,
      totalRemainingValue: 0,
      totalRedeemedValue: 0,
    });
  });
});
