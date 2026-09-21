import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import {
  BusinessGiftCardSoldStatus,
  BusinessGiftCardStatus,
} from 'src/business/enum/gift-card.enum';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from 'src/utils/enum';
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
    const sold = 'g.soldStatus = :sold AND g.status != :deleted';
    const raw = await this.giftCardRepo
      .createQueryBuilder('g')
      .select(`COUNT(*) FILTER (WHERE ${sold})`, 'soldCount')
      .addSelect(`COALESCE(SUM(g.amount) FILTER (WHERE ${sold}), 0)`, 'soldValue')
      .addSelect(`COUNT(*) FILTER (WHERE ${sold} AND g.status = :active)`, 'activeCount')
      .addSelect(`COUNT(*) FILTER (WHERE ${sold} AND g.status = :used)`, 'usedCount')
      .addSelect(`COUNT(*) FILTER (WHERE ${sold} AND g.status = :expired)`, 'expiredCount')
      .addSelect(`COUNT(*) FILTER (WHERE ${sold} AND g.status = :inactive)`, 'inactiveCount')
      .addSelect(
        `COALESCE(SUM(g.remainingAmount) FILTER (WHERE ${sold} AND g.status = :active), 0)`,
        'balanceHeld',
      )
      .addSelect(
        `COALESCE(SUM(g.amount - g.remainingAmount) FILTER (WHERE ${sold} AND g.status IN (:...spendable)), 0)`,
        'redeemedValue',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE g.soldStatus != :sold AND g.status != :deleted)',
        'unsoldCount',
      )
      .setParameters({
        sold: BusinessGiftCardSoldStatus.PURCHASED,
        deleted: BusinessGiftCardStatus.DELETED,
        active: BusinessGiftCardStatus.ACTIVE,
        used: BusinessGiftCardStatus.USED,
        expired: BusinessGiftCardStatus.EXPIRED,
        inactive: BusinessGiftCardStatus.INACTIVE,
        spendable: [
          BusinessGiftCardStatus.ACTIVE,
          BusinessGiftCardStatus.INACTIVE,
          BusinessGiftCardStatus.USED,
        ],
      })
      .getRawOne();

    const n = (value: unknown) => Number(value) || 0;
    const money = (value: unknown) => Math.round(n(value) * 100) / 100;
    return {
      soldCount: n(raw?.soldCount),
      soldValue: money(raw?.soldValue),
      activeCount: n(raw?.activeCount),
      usedCount: n(raw?.usedCount),
      expiredCount: n(raw?.expiredCount),
      inactiveCount: n(raw?.inactiveCount),
      balanceHeld: money(raw?.balanceHeld),
      redeemedValue: money(raw?.redeemedValue),
      unsoldCount: n(raw?.unsoldCount),
      totalAmount: money(raw?.soldValue),
    };
  }

  // -------------------------------------------------------------
  // GET ALL
  // -------------------------------------------------------------
  // Deleted cards are gone from the salon's side, so they aren't listed here either.
  async findAll() {
    const cards = await this.giftCardRepo.find({
      where: { status: Not(BusinessGiftCardStatus.DELETED) },
      relations: { business: true },
      order: { createdAt: 'DESC' },
    });
    const data = cards.map(({ business, ...card }) => ({
      ...card,
      businessName: business?.businessName ?? null,
    }));
    return {
      message: `Found ${data.length} gift card(s).`,
      total: data.length,
      data,
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
  // RESTORE BALANCE
  // -------------------------------------------------------------
  // Puts a sold card's balance back to what it was worth when sold (for example after a mistaken
  // redemption). No money moves and it can never raise a balance above the card's value.
  async restoreBalance(id: string, reason: string, restoredBy?: string) {
    const card = await this.giftCardRepo.findOne({ where: { id } });
    if (!card) throw new NotFoundException('Gift card not found.');

    if (card.soldStatus !== BusinessGiftCardSoldStatus.PURCHASED) {
      throw new BadRequestException('Only a gift card that has been sold can have its balance restored.');
    }
    if (card.status !== BusinessGiftCardStatus.ACTIVE) {
      throw new BadRequestException('Gift card is not active, so its balance cannot be restored.');
    }

    const value = Number(card.amount);
    const before = Number(card.remainingAmount);
    if (before >= value) {
      throw new BadRequestException('This gift card already has its full balance.');
    }

    card.remainingAmount = value;
    card.comment = `Balance restored from ${before.toFixed(2)} to ${value.toFixed(2)}: ${reason}`;
    await this.giftCardRepo.save(card);

    try {
      SlackService.notify({
        node: SlackNode.FINANCE,
        provider: SlackProvider.SYSTEM,
        severity: SlackSeverity.INFO,
        type: SlackEventType.ADMIN_ACTION,
        trigger: `Admin restored a gift card balance (${card.code})`,
        body: `An admin restored a gift card's balance to its full value. No money moved.
• Card: ${card.code}
• Balance: ${before.toFixed(2)} → ${value.toFixed(2)}
• Reason: ${reason}
• By: ${restoredBy ?? 'an admin'}`,
      });
    } catch {
      // A failed notification must never undo the restore.
    }

    return {
      message: `The balance on gift card ${card.code} was restored to ${value.toFixed(2)}.`,
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
}
