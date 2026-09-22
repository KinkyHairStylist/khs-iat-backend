import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  Actor,
  assertCanReactivate,
  markDeactivated,
  markReactivated,
} from '../utils/gift-card-deactivation';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { BusinessGiftCard } from '../entities/business-giftcard.entity';
import {
  BusinessGiftCardFiltersDto,
  CreateBusinessGiftCardDto,
  RedeemBusinessGiftCardDto,
  UpdateBusinessGiftCardDto,
} from '../dtos/requests/BusinessGiftCardDto';
import {
  BusinessGiftCardSoldStatus,
  BusinessGiftCardStatus,
  BusinessSentStatus,
} from '../enum/gift-card.enum';
import { Business } from '../entities/business.entity';
import {
  Transaction,
  TransactionType,
  PaymentMethod,
  TransactionStatus as TxnStatus,
} from '../entities/transaction.entity';
import { WalletCurrency } from '../../admin/payment/enums/wallet.enum';
import { PlatformSettingsService } from '../../admin/platform-settings/platform-settings.service';
import { BusinessWalletService } from './wallet.service';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from '../../utils/enum';
import { EmailService } from 'src/email/email.service';
import { TemplateService } from 'src/email/template.service';

@Injectable()
export class BusinessGiftCardsService {
  constructor(
    @InjectRepository(BusinessGiftCard)
    private giftCardRepository: Repository<BusinessGiftCard>,
    @InjectRepository(Business)
    private businessRepository: Repository<Business>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly walletService: BusinessWalletService,
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
  ) {}

  async create(
    createGiftCardDto: CreateBusinessGiftCardDto,
    ownerId: string,
  ): Promise<BusinessGiftCard> {
    const business = await this.businessRepository.findOne({
      where: { ownerId },
    });

    if (!business) {
      throw new BadRequestException(`No business found for this user`);
    }

    // Validate the gift card code format
    if (!this.isValidCodeFormat(createGiftCardDto.code)) {
      throw new BadRequestException('Invalid gift card code format');
    }

    // Check if code already exists
    const existingCard = await this.giftCardRepository.findOne({
      where: {
        code: createGiftCardDto.code,
        status: Not(BusinessGiftCardStatus.DELETED),
      },
    });

    if (existingCard) {
      throw new ConflictException(
        'Gift card code already exists. Please generate a new code.',
      );
    }

    // Calculate expiry date based on expiryInDays
    const expiryInDays = createGiftCardDto.expiryInDays || 365;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryInDays);

    const giftCard = this.giftCardRepository.create({
      ...createGiftCardDto,
      expiresAt,
      businessId: business.id,
    });
    return await this.giftCardRepository.save(giftCard);
  }

  async getBusinessSummary(ownerId: string): Promise<any> {
    const business = await this.businessRepository.findOne({
      where: { ownerId },
    });

    if (!business) {
      throw new BadRequestException(`No business found for this user`);
    }

    // Fetch all cards for this business EXCEPT deleted
    const allCards = await this.giftCardRepository
      .createQueryBuilder('giftCard')
      .where('giftCard.status != :deleted', { deleted: 'deleted' })
      .andWhere('giftCard.businessId = :businessId', {
        businessId: business.id,
      })
      .getMany();

    const now = new Date();

    // Calculate total cards that have not expired yet
    const activeCards = allCards.filter((card) => card.expiresAt > now);
    const totalCards = activeCards.length;

    // Calculate total value (sum of all amounts)
    const totalValue = allCards.reduce((sum, card) => {
      return sum + parseFloat(card.amount.toString());
    }, 0);

    // Calculate total remaining value
    const totalRemainingValue = allCards.reduce((sum, card) => {
      return sum + parseFloat(card.remainingAmount.toString());
    }, 0);

    // Calculate total redeemed value
    const totalRedeemedValue = totalValue - totalRemainingValue;

    // Count redeemed cards
    const totalRedeemedCards = allCards.filter(
      (card) => card.status === BusinessGiftCardStatus.USED,
    ).length;

    // Count pending cards (sent status is pending)
    const totalPendingCards = allCards.filter(
      (card) => card.sentStatus === BusinessSentStatus.PENDING,
    ).length;

    // Count sold cards (sent status is pending)
    const totalSoldCards = allCards.filter(
      (card) => card.soldStatus === BusinessGiftCardSoldStatus.PURCHASED,
    ).length;

    // Count available cards (not redeemed, not expired)
    const totalAvailableCards = allCards.filter(
      (card) =>
        card.status === BusinessGiftCardStatus.ACTIVE && card.expiresAt > now,
    ).length;

    // Count expired cards
    const totalExpiredCards = allCards.filter(
      (card) =>
        card.status === BusinessGiftCardStatus.EXPIRED || card.expiresAt <= now,
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

  private isValidCodeFormat(code: string): boolean {
    const pattern = /^KSH[A-Z0-9]{5}$/;
    return pattern.test(code);
  }

  /**
   * Get gift card list with filtering and pagination
   */
  async getGiftCardsList(filters: BusinessGiftCardFiltersDto, ownerId: string) {
    const business = await this.businessRepository.findOne({
      where: { ownerId },
    });

    if (!business) {
      throw new BadRequestException(`No business found for this user`);
    }

    const {
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 6,
      status,
      sentStatus,
    } = filters;

    const queryBuilder = this.giftCardRepository.createQueryBuilder('giftCard');

    /* --------- ALWAYS exclude deleted ---------- */
    queryBuilder.andWhere('giftCard.status != :deletedStatus', {
      deletedStatus: 'deleted',
    });

    /* --------- SCOPE TO THIS MERCHANT'S BUSINESS ---------- */
    queryBuilder.andWhere('giftCard.businessId = :businessId', {
      businessId: business.id,
    });

    /* --------- RELATIONS ---------- */
    queryBuilder.leftJoinAndSelect('giftCard.business', 'business');

    /* --------- FILTERS ---------- */
    if (sentStatus && sentStatus !== 'All') {
      queryBuilder.andWhere('giftCard.sentStatus = :sentStatus', {
        sentStatus,
      });
    }

    if (status && status !== 'All') {
      queryBuilder.andWhere('giftCard.status = :status', { status });
    }

    if (search) {
      queryBuilder.andWhere(
        `(giftCard.title ILIKE :searchTerm 
        OR giftCard.description ILIKE :searchTerm 
        OR giftCard.recipientName ILIKE :searchTerm
        OR giftCard.recipientEmail ILIKE :searchTerm
      )`,
        { searchTerm: `%${search}%` },
      );
    }

    /* --------- SORTING (APPLIED ONCE!) ---------- */

    // Otherwise follow user-defined sortBy and sortOrder
    queryBuilder.orderBy(
      `giftCard.${sortBy}`,
      sortOrder.toUpperCase() as 'ASC' | 'DESC',
    );

    /* --------- PAGINATION ---------- */
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    /* --------- EXECUTE ---------- */
    const [giftCards, total] = await queryBuilder.getManyAndCount();

    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit + 1;
    const endIndex = Math.min(page * limit, total);

    return {
      giftCards,
      meta: {
        total,
        page,
        limit,
        totalPages,
        startIndex,
        endIndex,
      },
    };
  }

  async findOne(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.giftCardRepository.findOne({ where: { id } });
    if (!giftCard) {
      throw new NotFoundException(`Gift card with ID ${id} not found`);
    }
    return giftCard;
  }

  async findOneByOwnerId(ownerId: string): Promise<BusinessGiftCard> {
    const giftCard = await this.giftCardRepository.findOne({
      where: { businessId: ownerId },
    });
    if (!giftCard) {
      throw new NotFoundException(`Gift card not found`);
    }
    return giftCard;
  }

  async findByCode(code: string): Promise<BusinessGiftCard> {
    const giftCard = await this.giftCardRepository.findOne({
      where: { code },
    });
    if (!giftCard) {
      throw new NotFoundException(`Gift card with code ${code} not found`);
    }
    return giftCard;
  }

  async update(
    id: string,
    updateGiftCardDto: UpdateBusinessGiftCardDto,
  ): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    Object.assign(giftCard, updateGiftCardDto);
    return await this.giftCardRepository.save(giftCard);
  }

  async redeem(
    redeemDto: RedeemBusinessGiftCardDto,
  ): Promise<BusinessGiftCard> {
    const giftCard = await this.findByCode(redeemDto.code);

    // Validate gift card can be redeemed
    if (giftCard.status === BusinessGiftCardStatus.USED) {
      throw new BadRequestException(
        'Gift card has already been fully redeemed',
      );
    }

    if (giftCard.status === BusinessGiftCardStatus.EXPIRED) {
      throw new BadRequestException('Gift card has expired');
    }

    if (giftCard.status === BusinessGiftCardStatus.INACTIVE) {
      throw new BadRequestException('Gift card has been cancelled');
    }

    if (new Date() > giftCard.expiresAt) {
      giftCard.status = BusinessGiftCardStatus.EXPIRED;
      await this.giftCardRepository.save(giftCard);
      throw new BadRequestException('Gift card has expired');
    }

    const amountToRedeem = redeemDto.amountToRedeem || giftCard.remainingAmount;

    if (amountToRedeem > giftCard.remainingAmount) {
      throw new BadRequestException(
        `Cannot redeem ${amountToRedeem}. Only ${giftCard.remainingAmount} remaining`,
      );
    }

    // Commission (flat rate) is skimmed here, on redemption — not at
    // purchase, when the full value just enters the pre-paid pool. The
    // business gets the net share credited to their wallet; KHS's cut is
    // recorded as its own Transaction row for the ledger.
    const payments = await this.platformSettingsService.getPayments();
    const commissionRate = Number(payments.commissionRate) || 0;
    const commissionAmount = amountToRedeem * (commissionRate / 100);
    const netToBusiness = amountToRedeem - commissionAmount;

    const business = await this.businessRepository.findOne({
      where: { id: giftCard.businessId },
      relations: ['owner'],
    });

    const savedGiftCard = await this.dataSource.manager.transaction(
      async (manager) => {
        giftCard.remainingAmount -= amountToRedeem;
        if (giftCard.remainingAmount === 0) {
          giftCard.status = BusinessGiftCardStatus.USED;
          giftCard.redeemedAt = new Date();
        }
        const saved = await manager.save(BusinessGiftCard, giftCard);

        if (commissionAmount > 0) {
          const commissionTx = manager.create(Transaction, {
            recipientId: business?.owner?.id,
            amount: commissionAmount,
            type: TransactionType.FEE,
            feeSubtype: 'Commission',
            currency: WalletCurrency.USD,
            description: `Commission for gift card redemption (${giftCard.code})`,
            mode: 'Web',
            referenceId: giftCard.code,
            status: TxnStatus.COMPLETED,
            method: PaymentMethod.GIFTCARD,
            service: 'GiftCard-Redemption-Fee',
          });
          await manager.save(Transaction, commissionTx);
        }

        return saved;
      },
    );

    // Credit the business's net share — mirrors how a booking's
    // bookingAmount (never the fee) gets credited via addFunds.
    if (netToBusiness > 0 && business?.id && business?.owner?.id) {
      try {
        // Mirrors booking.service.ts's own fallback: a business that's
        // never had a paid booking (only ever sold prepaid gift cards)
        // may genuinely have no wallet row yet.
        try {
          await this.walletService.getWalletByBusinessId(business.id);
        } catch {
          await this.walletService.createWalletForBusiness({
            businessId: business.id,
            ownerId: business.owner.id,
            currency: WalletCurrency.USD,
            description: 'Business wallet - auto-created from gift card redemption',
          });
        }

        await this.walletService.addFunds({
          businessId: business.id,
          recipientId: business.owner.id,
          senderId: business.owner.id,
          amount: netToBusiness,
          type: TransactionType.EARNING,
          description: `Gift card redemption (${giftCard.code})`,
          referenceId: giftCard.code,
          currency: WalletCurrency.USD,
          mode: 'Web',
          method: PaymentMethod.GIFTCARD,
        });
      } catch (walletError) {
        console.error('Failed to credit business wallet for gift card redemption:', walletError);
        // The card is already saved USED/decremented inside the committed
        // transaction above — if crediting the wallet fails here, the
        // business is never paid for a redemption that already happened.
        SlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.SYSTEM,
          severity: SlackSeverity.CRITICAL,
          type: SlackEventType.ERROR_ALERT,
          trigger: `Gift card redemption wallet credit failed (${giftCard.code})`,
          body: `A business gift card was redeemed and its balance already decremented, but crediting the business's wallet for the net amount ($${netToBusiness}) failed.
• Gift card: ${giftCard.code}
• Business: ${business?.businessName || business?.id}
• Error: ${walletError instanceof Error ? walletError.message : String(walletError)}`,
        });
      }
    }

    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.PAYMENT_SUCCESS,
      trigger: `Gift card redeemed in-store (${giftCard.code})`,
      body: `A business gift card was redeemed in-store by the merchant.
• Gift card: ${giftCard.title} (${giftCard.code})
• Business: ${business?.businessName || business?.id}
• Amount redeemed: $${amountToRedeem.toFixed(2)}
• Remaining balance: $${savedGiftCard.remainingAmount.toFixed(2)}`,
    });

    const holderEmail = giftCard.recipientEmail || giftCard.ownerEmail;
    const holderName = giftCard.recipientName || giftCard.ownerFullName;
    if (holderEmail) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
      const message = `$${amountToRedeem.toFixed(2)} was redeemed from your gift card "${giftCard.title}" (${giftCard.code}) at ${business?.businessName || 'the salon'}. Remaining balance: $${savedGiftCard.remainingAmount.toFixed(2)}.`;
      const html = this.templateService.render('communication-bulk', {
        businessName: business?.businessName || 'Kinky Hairstylist',
        subject: 'Your gift card was redeemed',
        clientName: holderName || 'there',
        message,
        closingRemarks: null,
        frontendUrl,
        year: new Date().getFullYear(),
      });
      this.emailService.sendEmail(holderEmail, 'Your gift card was redeemed', message, html);
    }

    return savedGiftCard;
  }

  async markAsSent(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    giftCard.sentStatus = BusinessSentStatus.SENT;
    return await this.giftCardRepository.save(giftCard);
  }

  async markAsDelete(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    giftCard.status = BusinessGiftCardStatus.DELETED;
    return await this.giftCardRepository.save(giftCard);
  }

  async markAsExpired(id: string, actor?: Actor): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    markDeactivated(giftCard, actor);
    const saved = await this.giftCardRepository.save(giftCard);
    this.notifyGiftCardDeactivated(giftCard, 'marked expired');
    return saved;
  }

  private notifyGiftCardDeactivated(giftCard: BusinessGiftCard, reason: string): void {
    const holderEmail = giftCard.recipientEmail || giftCard.ownerEmail;
    const holderName = giftCard.recipientName || giftCard.ownerFullName || 'there';
    if (!holderEmail || Number(giftCard.remainingAmount) <= 0) return;

    const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
    const subject = 'Your gift card has been deactivated';
    const message = `Your gift card "${giftCard.title}" (${giftCard.code}) was ${reason} with a remaining balance of $${Number(giftCard.remainingAmount).toFixed(2)}. Please contact the business if you believe this is a mistake.`;
    const html = this.templateService.render('communication-bulk', {
      businessName: 'Kinky Hairstylist',
      subject,
      clientName: holderName,
      message,
      closingRemarks: null,
      frontendUrl,
      year: new Date().getFullYear(),
    });
    this.emailService.sendEmail(holderEmail, subject, message, html);
  }

  async markAsDelivered(id: string): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    giftCard.sentStatus = BusinessSentStatus.DELIVERED;
    return await this.giftCardRepository.save(giftCard);
  }

  async reactivate(id: string, actor: Actor): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);
    assertCanReactivate(giftCard, actor.role);
    markReactivated(giftCard);
    return await this.giftCardRepository.save(giftCard);
  }

  async cancel(id: string, actor?: Actor): Promise<BusinessGiftCard> {
    const giftCard = await this.findOne(id);

    if (giftCard.status === BusinessGiftCardStatus.USED) {
      throw new BadRequestException('Cannot cancel a redeemed gift card');
    }

    markDeactivated(giftCard, actor);
    const saved = await this.giftCardRepository.save(giftCard);
    this.notifyGiftCardDeactivated(giftCard, 'cancelled by the business');
    return saved;
  }

  async remove(id: string): Promise<void> {
    const result = await this.giftCardRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Gift card with ID ${id} not found`);
    }
  }

  async checkExpiredCards(): Promise<number> {
    const now = new Date();
    const result = await this.giftCardRepository
      .createQueryBuilder()
      .update(BusinessGiftCard)
      .set({ status: BusinessGiftCardStatus.EXPIRED })
      .where('expiresAt < :now', { now })
      .andWhere('status = :status', {
        status: BusinessGiftCardStatus.ACTIVE,
      })
      .execute();

    return result.affected || 0;
  }

  async creditWalletFromGiftCard(
    businessId: string,
    amount: number,
    reference: string,
  ) {
    // await this.addFunds({
    //   businessId,
    //   amount,
    //   type: 'credit',
    //   description: `Gift card purchase via Paystack`,
    //   referenceId: reference,
    // });
  }
}
