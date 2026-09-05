import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { Card } from 'src/all_user_entities/card.entity';
import { User } from 'src/all_user_entities/user.entity';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from 'src/business/entities/transaction.entity';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';
import { PaystackService } from 'src/payment/paystack.service';
import {
  PurchaseBusinessGiftCardDto,
  RedeemGiftCardDto,
  ValidateGiftCardDto,
} from '../dtos/create-gift-card.dto';
import {
  BusinessGiftCardSoldStatus,
  BusinessGiftCardStatus,
} from 'src/business/enum/gift-card.enum';
import { PlatformSettingsService } from '../../admin/platform-settings/platform-settings.service';
import { EmailService } from '../../email/email.service';
import { SlackService } from 'src/slack/slack.service';

@Injectable()
export class GiftCardService {
  constructor(
    @InjectRepository(BusinessGiftCard)
    private readonly giftCardRepo: Repository<BusinessGiftCard>,

    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    private readonly dataSource: DataSource,
    private readonly walletService: BusinessWalletService,
    private readonly paystack: PaystackService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly emailService: EmailService,
    private readonly slackService: SlackService,
  ) {}

  // ------------------------------------------------------
  // Step 1 — Initialize Purchase (Creates PENDING transaction)
  // ------------------------------------------------------
  async purchaseGiftCard(dto: PurchaseBusinessGiftCardDto, purchaser: User) {
    const giftCard = await this.giftCardRepo.findOne({
      where: { code: dto.businessGiftCardId },
      relations: ['business', 'business.owner'],
    });

    if (!giftCard) throw new NotFoundException('Gift card not found');
    if (!giftCard.business)
      throw new BadRequestException('Business could not be found');
    if (giftCard.soldStatus !== BusinessGiftCardSoldStatus.AVAILABLE)
      throw new BadRequestException('Gift card already purchased');

    const card = await this.cardRepo.findOne({
      where: { id: dto.cardId },
      relations: ['user'],
    });

    if (!card) throw new NotFoundException('Payment card not found');
    if (card.user.id !== purchaser.id)
      throw new ForbiddenException('You cannot use this payment method');

    // Get platform fee percentage
    const paymentsSettings = await this.platformSettingsService.getPayments();
    const platformFeePercent = Number(paymentsSettings.platformFee) || 0;

    // Calculate gift card amount and fee
    const giftCardAmount = Number(giftCard.amount);
    const feeAmount = giftCardAmount * (platformFeePercent / 100);
    const totalAmount = giftCardAmount + feeAmount;
    const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

    // Calculate expiry date
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + (giftCard.expiryInDays || 365));

    // Ensure purchaser profile is fully loaded
    const buyer =
      (await this.dataSource.getRepository(User).findOne({
        where: { id: purchaser.id },
      })) || purchaser;
    const buyerEmail = buyer.email || purchaser.email;
    const buyerFullName =
      `${buyer.firstName ?? purchaser.firstName ?? ''} ${buyer.surname ?? purchaser.surname ?? ''}`.trim() ||
      'Valued Customer';

    // UPDATE GIFT CARD OWNERSHIP & DETAILS
    giftCard.soldStatus = BusinessGiftCardSoldStatus.PURCHASED;
    giftCard.status = BusinessGiftCardStatus.ACTIVE;
    giftCard.remainingAmount = giftCardAmount;
    giftCard.recipientName = dto.recipientName ?? 'No name provided';
    giftCard.recipientEmail = dto.recipientEmail ?? 'No Email provided';
    giftCard.message = dto.message ?? '';
    giftCard.senderName =
      dto.fullName ?? buyerFullName;
    giftCard.ownerId = purchaser.id;
    giftCard.ownerEmail = buyerEmail;
    giftCard.ownerFullName = buyerFullName;
    giftCard.cardId = dto.cardId ?? undefined;
    giftCard.expiresAt = expiry;

    await this.giftCardRepo.save(giftCard);

    const reference = `GC-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Save completed gift card purchase transaction
    const giftCardTx = this.transactionRepo.create({
      senderId: purchaser.id,
      recipientId: giftCard.business?.ownerId,
      amount: giftCardAmount,
      type: TransactionType.DEBIT,
      currency: (giftCard.currency as any) || WalletCurrency.USD,
      description: `Purchase of gift card "${giftCard.title}"`,
      mode: 'Web',
      referenceId: reference,
      status: TransactionStatus.COMPLETED,
      method: PaymentMethod.CARD,
      service: 'GiftCard-Purchase',
      customerName: `${purchaser.firstName} ${purchaser.surname}`,
    });
    await this.transactionRepo.save(giftCardTx);

    // Save completed platform fee transaction
    if (feeAmount > 0) {
      const feeTx = this.transactionRepo.create({
        senderId: purchaser.id,
        recipientId: undefined, // Platform fee goes to system
        amount: feeAmount,
        type: TransactionType.FEE,
        currency: (giftCard.currency as any) || WalletCurrency.USD,
        description: `Platform fee for gift card "${giftCard.title}" purchase`,
        mode: 'Web',
        referenceId: reference,
        status: TransactionStatus.COMPLETED,
        method: PaymentMethod.CARD,
        service: 'GiftCard-Fee',
        customerName: `${purchaser.firstName} ${purchaser.surname}`,
      });
      await this.transactionRepo.save(feeTx);
    }

    // Update business wallet
    try {
      const ownerId = giftCard.business?.ownerId || giftCard.business?.owner?.id;
      if (giftCard.businessId && ownerId) {
        await this.walletService.addFunds({
          businessId: giftCard.businessId,
          recipientId: ownerId,
          senderId: purchaser.id,
          amount: giftCardAmount,
          type: TransactionType.EARNING,
          description: `Business Gift card purchase`,
          referenceId: reference,
        });
      }
    } catch (walletError) {
      console.error('Failed to add funds to business wallet:', walletError);
    }

    // Send confirmation email to purchaser (buyer)
    if (giftCard.ownerEmail) {
      this.emailService.sendGiftCardEmail(
        giftCard.ownerEmail,
        giftCard.ownerFullName || 'Valued Customer',
        'purchased',
        giftCard.code,
        giftCardAmount,
        giftCard.recipientName || undefined,
        giftCard.senderName || undefined,
        undefined,
        giftCard.message || undefined,
      );
    }

    // Send gift card email to recipient if provided and different from purchaser
    if (
      giftCard.recipientEmail &&
      giftCard.recipientEmail !== giftCard.ownerEmail &&
      giftCard.recipientEmail !== 'No Email provided'
    ) {
      this.emailService.sendGiftCardEmail(
        giftCard.recipientEmail,
        giftCard.recipientName || 'Valued Friend',
        'received',
        giftCard.code,
        giftCardAmount,
        giftCard.recipientName || undefined,
        giftCard.senderName || giftCard.ownerFullName || undefined,
        undefined,
        giftCard.message || undefined,
      );
    }

    // Send Slack notification
    try {
      this.slackService.notify(
        `🎁 *Gift Card Purchased*\n` +
        `• *Card*: "${giftCard.title}" (\`${giftCard.code}\`)\n` +
        `• *Purchaser*: ${giftCard.ownerFullName || 'Customer'} (${giftCard.ownerEmail || 'N/A'})\n` +
        `• *Recipient*: ${giftCard.recipientName || 'N/A'} (${giftCard.recipientEmail || 'N/A'})\n` +
        `• *Amount*: $${giftCardAmount.toFixed(2)}`
      );
    } catch (slackErr) {
      console.error('Failed to send Slack gift card purchase notification:', slackErr);
    }

    return {
      message: 'Gift card purchase completed successfully',
      giftCard,
      giftCardAmount,
      platformFee: feeAmount,
      totalAmount: roundedTotalAmount,
      authorizationUrl: null,
      reference,
    };
  }

  // ------------------------------------------------------
  // Step — Complete Purchase (Verify Payment & Save Transaction)
  // ------------------------------------------------------
  async completeGiftCardPurchase(reference: string) {
    // Verify payment
    const verification = await this.paystack.verifyPayment(reference);

    if (!verification || verification.status !== 'success') {
      const meta = verification.metadata;
      const giftCardId = meta.giftCardId;
      await this.giftCardRepo.update(
        { id: giftCardId },
        { soldStatus: BusinessGiftCardSoldStatus.AVAILABLE },
      );
      await this.transactionRepo.update(
        { referenceId: reference },
        { status: TransactionStatus.FAILED },
      );
      throw new BadRequestException('Payment verification failed');
    }

    const meta = verification.metadata;
    const giftCardAmount = Number(meta.giftCardAmount) || 0;
    const feeAmount = Number(meta.feeAmount) || 0;

    // Start DB transaction
    const result = await this.dataSource.manager.transaction(
      async (manager) => {
        // Find gift card (without heavy relations for now)
        const giftCard = await manager.findOne(BusinessGiftCard, {
          where: { id: meta.giftCardId },
        });
        if (!giftCard) throw new NotFoundException('Gift card not found');
        if (!giftCard.ownerId)
          throw new NotFoundException('Gift card business owner not found');
        if (giftCard.soldStatus === BusinessGiftCardSoldStatus.PURCHASED)
          throw new BadRequestException('Gift card already purchased');

        // Find purchaser
        const purchaser = await manager.findOne(User, {
          where: { id: meta.purchaserId },
        });
        if (!purchaser) throw new NotFoundException('Purchaser not found');

        // Load business and owner relations after basic validations
        const giftCardWithRelations = await manager.findOne(BusinessGiftCard, {
          where: { id: meta.giftCardId },
          relations: ['business', 'owner'],
        });
        if (!giftCardWithRelations?.owner)
          throw new NotFoundException('Gift card business owner not found');

        // Assign gift card
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + giftCard.expiryInDays);

        giftCard.ownerId = purchaser.id;
        giftCard.ownerEmail = purchaser.email;
        giftCard.ownerFullName = `${purchaser.firstName} ${purchaser.surname}`;
        giftCard.cardId = meta.cardId ?? null;
        giftCard.soldStatus = BusinessGiftCardSoldStatus.PURCHASED;
        giftCard.expiresAt = expiry;

        await manager.save(BusinessGiftCard, giftCard);

        // Complete gift card purchase transaction
        await manager.update(
          Transaction,
          {
            referenceId: reference,
            service: 'GiftCard-Purchase',
          },
          {
            status: TransactionStatus.COMPLETED,
            amount: giftCardAmount,
          },
        );

        // Complete platform fee transaction
        await manager.update(
          Transaction,
          {
            referenceId: reference,
            service: 'GiftCard-Fee',
          },
          {
            status: TransactionStatus.COMPLETED,
            amount: feeAmount,
          },
        );

        return {
          giftCard,
          giftCardAmount: giftCardAmount,
          platformFee: feeAmount,
          totalPaid: giftCardAmount + feeAmount,
        };
      },
    );

    // Update business wallet outside the transaction to avoid deadlock
    try {
      await this.walletService.addFunds({
        businessId: result.giftCard.businessId,
        recipientId: result.giftCard.ownerId!,
        senderId: meta.purchaserId,
        amount: result.giftCardAmount, // Convert to minor units
        type: TransactionType.EARNING,
        description: `Business Gift card purchase via Paystack`,
        referenceId: reference,
      });
    } catch (walletError) {
      // Log the error but don't fail the entire operation since gift card was purchased successfully
      console.error('Failed to add funds to business wallet:', walletError);
    }

    // Send confirmation email to purchaser (buyer)
    if (result.giftCard.ownerEmail) {
      this.emailService.sendGiftCardEmail(
        result.giftCard.ownerEmail,
        result.giftCard.ownerFullName || 'Valued Customer',
        'purchased',
        result.giftCard.code,
        result.giftCardAmount,
        result.giftCard.recipientName || undefined,
        result.giftCard.senderName || undefined,
        undefined,
        result.giftCard.message || undefined,
      );
    }

    // Send gift card email to recipient if provided and different from purchaser
    if (
      result.giftCard.recipientEmail &&
      result.giftCard.recipientEmail !== result.giftCard.ownerEmail &&
      result.giftCard.recipientEmail !== 'No Email provided'
    ) {
      this.emailService.sendGiftCardEmail(
        result.giftCard.recipientEmail,
        result.giftCard.recipientName || 'Valued Friend',
        'received',
        result.giftCard.code,
        result.giftCardAmount,
        result.giftCard.recipientName || undefined,
        result.giftCard.senderName || result.giftCard.ownerFullName || undefined,
        undefined,
        result.giftCard.message || undefined,
      );
    }

    // Send Slack notification
    try {
      this.slackService.notify(
        `🎁 *Gift Card Purchased*\n` +
        `• *Card*: "${result.giftCard.title}" (\`${result.giftCard.code}\`)\n` +
        `• *Purchaser*: ${result.giftCard.ownerFullName || 'Customer'} (${result.giftCard.ownerEmail || 'N/A'})\n` +
        `• *Recipient*: ${result.giftCard.recipientName || 'N/A'} (${result.giftCard.recipientEmail || 'N/A'})\n` +
        `• *Amount*: $${result.giftCardAmount.toFixed(2)}`
      );
    } catch (slackErr) {
      console.error('Failed to send Slack gift card purchase notification:', slackErr);
    }

    return {
      message: 'Gift card purchase completed successfully',
      ...result,
    };
  }

  // ------------------------------------------------------
  // 🔎 Validate Gift Card
  // ------------------------------------------------------
  async validateGiftCard(dto: ValidateGiftCardDto) {
    const giftCard = await this.giftCardRepo.findOne({
      where: { code: dto.code },
    });

    if (!giftCard) throw new NotFoundException('Gift card not found');

    const now = new Date();

    if (giftCard.expiresAt < now)
      return { valid: false, reason: 'Gift card expired' };
    if (giftCard.soldStatus !== BusinessGiftCardSoldStatus.PURCHASED)
      return { valid: false, reason: 'Gift card not purchased' };
    if (giftCard.remainingAmount <= 0)
      // return { valid: false, reason: 'Gift card fully redeemed' };
      return { valid: false, reason: 'Gift card already redeemed' };

    return {
      valid: true,
      amount: giftCard.remainingAmount,
      expiresAt: giftCard.expiresAt,
      status: giftCard.status,
    };
  }

  // ------------------------------------------------------
  // ✔ Redeem Gift Card (logs transaction)
  // ------------------------------------------------------
  async redeemGiftCard(dto: RedeemGiftCardDto, user: User) {
    const giftCard = await this.giftCardRepo.findOne({
      where: { code: dto.code },
    });

    if (!giftCard) throw new NotFoundException('Gift card not found');

    const now = new Date();

    if (giftCard.expiresAt < now)
      throw new BadRequestException('Gift card expired');
    if (giftCard.remainingAmount <= 0)
      throw new BadRequestException('Gift card already redeemed');

    const amount = Number(giftCard.remainingAmount);

    const originalOwnerId = giftCard.ownerId;

    // Redeem inside a transaction
    const result = await this.dataSource.manager.transaction(
      async (manager) => {
        giftCard.remainingAmount = 0;
        giftCard.redeemedAt = now;
        giftCard.status = BusinessGiftCardStatus.USED;
        giftCard.ownerId = user.id;
        giftCard.ownerEmail = user.email;
        giftCard.ownerFullName =
          `${user.firstName ?? ''} ${user.surname ?? ''}`.trim();

        await manager.save(BusinessGiftCard, giftCard);

        // Log redemption transaction
        const tx = this.transactionRepo.create({
          senderId: originalOwnerId,
          recipientId: user.id,
          amount,
          type: TransactionType.EARNING,
          currency: giftCard.currency as any,
          description: `Redeemed gift card "${giftCard.title}"`,
          mode: 'System',
          referenceId: giftCard.code,
          status: TransactionStatus.COMPLETED,
          method: PaymentMethod.GIFTCARD,
          service: 'GiftCard-Redemption',
        });

        await manager.save(Transaction, tx);

        return {
          message: 'Gift card redeemed',
          amountUsed: amount,
          redeemedAt: giftCard.redeemedAt,
        };
      },
    );

    let targetUser = user;
    if (!targetUser?.email && targetUser?.id) {
      targetUser = (await this.dataSource.getRepository(User).findOne({ where: { id: targetUser.id } })) || targetUser;
    }
    const userEmail = targetUser?.email || giftCard.ownerEmail;
    const userName = `${targetUser?.firstName ?? ''} ${targetUser?.surname ?? ''}`.trim() || targetUser?.firstName || 'Valued Customer';

    if (userEmail) {
      this.emailService.sendGiftCardEmail(
        userEmail,
        userName,
        'redeemed',
        giftCard.code,
        amount,
        undefined,
        undefined,
        0,
      );
    }

    try {
      this.slackService.notify(
        `🎟️ *Gift Card Redeemed*\n` +
        `• *Card*: "${giftCard.title}" (\`${giftCard.code}\`)\n` +
        `• *Redeemed By*: ${userName} (${userEmail || 'N/A'})\n` +
        `• *Amount Redeemed*: $${amount.toFixed(2)}`
      );
    } catch (slackErr) {
      console.error('Failed to send Slack gift card redemption notification:', slackErr);
    }

    return result;
  }

  /** Stats for user-owned gift cards */
  async getGiftCardStatsByUser(user: User) {
    // Calculate total gift card balance (sum of remaining amounts)
    const totalBalanceResult = await this.giftCardRepo
      .createQueryBuilder('giftCard')
      .select('SUM(giftCard.remainingAmount)', 'total')
      .where('giftCard.ownerId = :ownerId', { ownerId: user.id })
      .getRawOne();

    const totalGiftCardBalance = parseFloat(totalBalanceResult?.total || '0');

    // Count active cards
    const activeCards = await this.giftCardRepo.count({
      where: { ownerId: user.id, status: BusinessGiftCardStatus.ACTIVE },
    });

    // Count used cards
    const usedCards = await this.giftCardRepo.count({
      where: { ownerId: user.id, status: BusinessGiftCardStatus.USED },
    });

    return { totalGiftCardBalance, activeCards, usedCards };
  }

  /** Get all gift cards owned by the authenticated user */
  async getUserOwnedGiftCards(user: User) {
    return this.giftCardRepo.find({
      where: {
        ownerId: user.id,
        soldStatus: BusinessGiftCardSoldStatus.PURCHASED,
      },
      relations: ['business'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Get all AVAILABLE gift cards */
  async getAllAvailableBusinessGiftCards() {
    return this.giftCardRepo.find({
      where: {
        soldStatus: BusinessGiftCardSoldStatus.AVAILABLE,
        status: BusinessGiftCardStatus.ACTIVE,
      },
      relations: ['business'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Get gift card fee from admin platform settings */
  async getGiftCardFee() {
    const paymentsSettings = await this.platformSettingsService.getPayments();
    return { giftCardFee: paymentsSettings.platformFee };
  }
}
