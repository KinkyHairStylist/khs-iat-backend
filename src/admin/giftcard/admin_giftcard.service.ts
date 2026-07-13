import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { BusinessGiftCardStatus } from 'src/business/enum/gift-card.enum';
import { GiftCardSummaryDto } from './dto/giftcard-summary.dto';
import { User } from 'src/all_user_entities/user.entity';

@Injectable()
export class GiftcardService {
  constructor(
    @InjectRepository(BusinessGiftCard)
    private readonly giftCardRepo: Repository<BusinessGiftCard>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  async getSummary(): Promise<GiftCardSummaryDto> {
    const totalAmount = await this.giftCardRepo
      .createQueryBuilder('gift')
      .select('SUM(gift.amount)', 'sum')
      .getRawOne();

    const activeCount = await this.giftCardRepo.count({
      where: { status: BusinessGiftCardStatus.ACTIVE },
    });

    const usedCount = await this.giftCardRepo.count({
      where: { status: BusinessGiftCardStatus.USED },
    });

    const expiredCount = await this.giftCardRepo.count({
      where: { status: BusinessGiftCardStatus.EXPIRED },
    });

    const inactiveCount = await this.giftCardRepo.count({
      where: { status: BusinessGiftCardStatus.INACTIVE },
    });

    return {
      totalAmount: Number(totalAmount.sum) || 0,
      activeCount,
      usedCount,
      expiredCount,
      inactiveCount,
    };
  }

  // -------------------------------------------------------------
  // GET ALL
  // -------------------------------------------------------------
  async findAll() {
    const cards = await this.giftCardRepo.find();
    return {
      message: `Found ${cards.length} gift card(s).`,
      total: cards.length,
      data: cards,
    };
  }

  // -------------------------------------------------------------
  // GET ONE (by id or code)
  // -------------------------------------------------------------
  async findOne(identifier: string) {
    const giftCard = await this.giftCardRepo.findOne({
      where: [{ id: identifier }, { code: identifier }],
    });

    if (!giftCard)
      throw new NotFoundException(
        `Gift card not found for ID/code: ${identifier}`,
      );

    return {
      message: 'Gift card retrieved successfully.',
      data: giftCard,
    };
  }

  // -------------------------------------------------------------
  // DEACTIVATE
  // -------------------------------------------------------------
  async deactivateGiftCard(id: string, reason: string) {
    const card = await this.giftCardRepo.findOne({ where: { id } });
    if (!card) throw new NotFoundException('Gift card not found.');

    if (card.status !== BusinessGiftCardStatus.ACTIVE) {
      throw new BadRequestException(
        'Gift card is already inactive, expired, or redeemed.',
      );
    }

    card.status = BusinessGiftCardStatus.INACTIVE;
    card.comment = reason;

    await this.giftCardRepo.save(card);

    return {
      message: `Gift card (${card.code}) has been deactivated.`,
      data: card,
    };
  }

  // -------------------------------------------------------------
  // REFUND
  // -------------------------------------------------------------
  async refundGiftCard(id: string, amount: number, reason: string) {
    const card = await this.giftCardRepo.findOne({ where: { id } });
    if (!card) throw new NotFoundException('Gift card not found.');

    if (card.status !== BusinessGiftCardStatus.ACTIVE) {
      throw new BadRequestException('Gift card is not active. Cannot refund.');
    }

    card.remainingAmount = amount;
    card.comment = reason;

    await this.giftCardRepo.save(card);

    return {
      message: `Refund of ${amount} applied successfully to card (${card.code}).`,
      updatedBalance: card.remainingAmount,
      data: card,
    };
  }

  // -------------------------------------------------------------
  // USAGE HISTORY (placeholder)
  // -------------------------------------------------------------
  async getUsageHistory(id: string) {
    const card = await this.giftCardRepo.findOne({ where: { id } });
    if (!card) throw new NotFoundException('Gift card not found.');

    return {
      message: `Usage history for gift card (${card.code}) retrieved successfully.`,
      data: {
        redeemedAt: card.redeemedAt,
        note: 'Transaction history feature coming soon.',
      },
    };
  }

  // -------------------------------------------------------------
  // DELETE ALL
  // -------------------------------------------------------------
  async deleteAllGiftCards() {
    await this.giftCardRepo.clear();
    return {
      message: 'All gift cards have been permanently deleted.',
    };
  }
}
