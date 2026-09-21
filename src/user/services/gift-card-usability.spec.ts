import { BadRequestException } from '@nestjs/common';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import {
  BusinessGiftCardSoldStatus,
  BusinessGiftCardStatus,
} from 'src/business/enum/gift-card.enum';
import { assertGiftCardUsable } from './gift-card-usability';

const SALON = 'salon-1';
const now = new Date('2026-09-21T12:00:00Z');

const card = (over: Partial<BusinessGiftCard> = {}) =>
  ({
    businessId: SALON,
    soldStatus: BusinessGiftCardSoldStatus.PURCHASED,
    status: BusinessGiftCardStatus.ACTIVE,
    remainingAmount: 50,
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    ...over,
  }) as BusinessGiftCard;

describe('assertGiftCardUsable', () => {
  it('accepts a sold, active, unexpired card with balance at the issuing salon', () => {
    expect(() => assertGiftCardUsable(card(), SALON, now)).not.toThrow();
  });

  it('refuses a card that does not exist', () => {
    expect(() => assertGiftCardUsable(null, SALON, now)).toThrow('Gift card not found');
  });

  it.each([
    [BusinessGiftCardSoldStatus.AVAILABLE],
    [BusinessGiftCardSoldStatus.PENDING],
  ])('refuses a card that has not been sold (%s)', (soldStatus) => {
    expect(() => assertGiftCardUsable(card({ soldStatus }), SALON, now)).toThrow(
      BadRequestException,
    );
  });

  it.each([[BusinessGiftCardStatus.INACTIVE], [BusinessGiftCardStatus.USED]])(
    'refuses a card that is %s',
    (status) => {
      expect(() => assertGiftCardUsable(card({ status }), SALON, now)).toThrow(
        'Gift card is not active',
      );
    },
  );

  it('refuses an expired card', () => {
    const expiresAt = new Date('2026-09-01T00:00:00Z');
    expect(() => assertGiftCardUsable(card({ expiresAt }), SALON, now)).toThrow(
      'Gift card has expired',
    );
  });

  it('refuses a card with no balance', () => {
    expect(() => assertGiftCardUsable(card({ remainingAmount: 0 }), SALON, now)).toThrow(
      'Gift card has no balance',
    );
  });

  it("refuses a card from a different salon", () => {
    expect(() => assertGiftCardUsable(card({ businessId: 'salon-2' }), SALON, now)).toThrow(
      'only be used at the salon that issued it',
    );
  });
});
