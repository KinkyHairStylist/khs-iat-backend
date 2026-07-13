import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { GiftCard, GiftCardStatus } from '../all_user_entities/gift-card.entity';
import { RedeemGiftCardDto } from '../user/dtos/create-gift-card.dto';
import { User } from '../all_user_entities/user.entity';

/**
 * Helper class for redeeming gift cards using a unique code.
 * Keeps core redemption logic isolated from service controllers.
 */
export class GiftCardRedeemHelper {
  static async redeemGiftCardByCode(
    giftCardRepo: Repository<GiftCard>,
    dto: RedeemGiftCardDto,
    user: User,
  ) {
    // Find gift card by unique code only
    const giftCard = await giftCardRepo.findOne({
      where: { code: dto.code },
    });

    if (!giftCard) {
      throw new NotFoundException('Gift card not found');
    }

    // Ensure card is still active
    if (giftCard.status !== GiftCardStatus.ACTIVE) {
      throw new BadRequestException('Gift card already used or inactive');
    }

    // Check for expiration
    const now = new Date();
    if (giftCard.expiresAt && giftCard.expiresAt < now) {
      giftCard.status = GiftCardStatus.EXPIRED;
      await giftCardRepo.save(giftCard);
      throw new BadRequestException('Gift card has expired');
    }

    // Mark as redeemed
    giftCard.status = GiftCardStatus.USED;
    giftCard.usedAt = now;
    await giftCardRepo.save(giftCard);

    return {
      message: 'Gift card successfully redeemed',
      redeemedBy: user.email,
      code: giftCard.code,
      amount: giftCard.amount,
      usedAt: giftCard.usedAt,
    };
  }
}
