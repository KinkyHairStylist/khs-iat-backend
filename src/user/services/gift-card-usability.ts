import { BadRequestException } from '@nestjs/common';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import {
  BusinessGiftCardSoldStatus,
  BusinessGiftCardStatus,
} from 'src/business/enum/gift-card.enum';

/**
 * Whether a gift card can be spent on a booking at the given salon. Cards that
 * are still unsold salon stock, expired, deactivated, empty, or belong to a
 * different salon are refused — the salon that sold a card is the one that was
 * paid for it, so it cannot be spent anywhere else.
 */
export function assertGiftCardUsable(
  gift: BusinessGiftCard | null,
  businessId: string,
  now: Date = new Date(),
): asserts gift is BusinessGiftCard {
  if (!gift) throw new BadRequestException('Gift card not found');
  if (gift.soldStatus !== BusinessGiftCardSoldStatus.PURCHASED)
    throw new BadRequestException('Gift card is not active');
  if (gift.status !== BusinessGiftCardStatus.ACTIVE)
    throw new BadRequestException('Gift card is not active');
  if (gift.expiresAt && new Date(gift.expiresAt) < now)
    throw new BadRequestException('Gift card has expired');
  if (Number(gift.remainingAmount) <= 0)
    throw new BadRequestException('Gift card has no balance');
  if (gift.businessId !== businessId)
    throw new BadRequestException('This gift card can only be used at the salon that issued it');
}
