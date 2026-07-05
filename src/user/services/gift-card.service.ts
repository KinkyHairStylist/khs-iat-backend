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
import { Transaction, TransactionType, TransactionStatus, PaymentMethod } from 'src/business/entities/transaction.entity';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import { PaystackService } from 'src/payment/paystack.service';
import { PurchaseBusinessGiftCardDto, RedeemGiftCardDto, ValidateGiftCardDto } from '../dtos/create-gift-card.dto';
import { BusinessGiftCardSoldStatus, BusinessGiftCardStatus } from 'src/business/enum/gift-card.enum';
import { PlatformSettingsService } from '../../admin/platform-settings/platform-settings.service';

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
  ) {}

  // ------------------------------------------------------
  // Step 1 — Initialize Purchase (Creates PENDING transaction)
  // ------------------------------------------------------
  async purchaseGiftCard(dto: PurchaseBusinessGiftCardDto, purchaser: User) {
    const giftCard = await this.giftCardRepo.findOne({
      where: { code: dto.businessGiftCardId },
      relations: ['business'],
    });

    if (!giftCard) throw new NotFoundException('Gift card not found');
    if (!giftCard.business.owner) throw new BadRequestException('Business could not be found');
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
    // Round to 2 decimal places to ensure amount is integer when converted to kobo
    const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

    // Initialize Paystack payment with total amount (gift card + fee)
    const init = await this.paystack.initializePayment({
      email: purchaser.email,
      amount: Math.round(roundedTotalAmount * 100), // Convert to kobo and round to integer
      callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}customer/gift/purchase?template=${giftCard.template}&code=${giftCard.code}&amount=${giftCard.amount}`,
      metadata: {
        giftCardId: giftCard.id,
        purchaserId: purchaser.id,
        cardId: dto.cardId,
        giftCardAmount: giftCardAmount,
        feeAmount: feeAmount,
      },
    });

    if (!init?.reference)
      throw new BadRequestException('Unable to initialize payment');

    // UPDATE GIFT CARD OWNERSHIP & DETAILS
    giftCard.soldStatus = BusinessGiftCardSoldStatus.PENDING;
    giftCard.status = BusinessGiftCardStatus.ACTIVE;
    giftCard.remainingAmount = giftCardAmount;

    // Recipient is from DTO
    giftCard.recipientName = dto.recipientName ?? 'No name provided';
    giftCard.recipientEmail = dto.recipientEmail ?? 'No Email provided';

    // Sender is from DTO (fullName), fallback to purchaser name if missing
    giftCard.senderName = dto.fullName ?? `${purchaser.firstName} ${purchaser.surname}`;

    // The buyer becomes the OWNER
    giftCard.ownerId = purchaser.id;
    giftCard.ownerEmail = purchaser.email;
    giftCard.ownerFullName = `${purchaser.firstName} ${purchaser.surname}`;

    giftCard.cardId = dto.cardId ?? undefined;

    await this.giftCardRepo.save(giftCard);

    // Save pending gift card purchase transaction
    const giftCardTx = this.transactionRepo.create({
      senderId: purchaser.id,
      recipientId: giftCard.business.ownerId,
      amount: giftCardAmount,
      type: TransactionType.DEBIT,
      currency: giftCard.currency as any,
      description: `Purchase of gift card "${giftCard.title}"`,
      mode: 'Web',
      referenceId: init.reference,
      status: TransactionStatus.PENDING,
      method: PaymentMethod.PAYSTACK,
      service: 'GiftCard-Purchase',
      customerName: `${purchaser.firstName} ${purchaser.surname}`,
    });

    await this.transactionRepo.save(giftCardTx);

    // Save pending platform fee transaction
    const feeTx = this.transactionRepo.create({
      senderId: purchaser.id,
      recipientId: undefined, // Platform fee goes to system
      amount: feeAmount,
      type: TransactionType.FEE,
      currency: giftCard.currency as any,
      description: `Platform fee for gift card "${giftCard.title}" purchase`,
      mode: 'Web',
      referenceId: init.reference,
      status: TransactionStatus.PENDING,
      method: PaymentMethod.PAYSTACK,
      service: 'GiftCard-Fee',
      customerName: `${purchaser.firstName} ${purchaser.surname}`,
    });

    await this.transactionRepo.save(feeTx);

    return {
      message: 'Payment initialized',
      giftCardAmount: giftCardAmount,
      platformFee: feeAmount,
      totalAmount: totalAmount,
      authorizationUrl: init.authorization_url,
      reference: init.reference,
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
        { soldStatus: BusinessGiftCardSoldStatus.AVAILABLE }
      );
      await this.transactionRepo.update(
        { referenceId: reference },
        { status: TransactionStatus.FAILED }
      );
      throw new BadRequestException('Payment verification failed');
    }

    const meta = verification.metadata;
    const giftCardAmount = Number(meta.giftCardAmount) || 0;
    const feeAmount = Number(meta.feeAmount) || 0;

    // Start DB transaction
    const result = await this.dataSource.manager.transaction(async (manager) => {
      // Find gift card (without heavy relations for now)
      const giftCard = await manager.findOne(BusinessGiftCard, {
        where: { id: meta.giftCardId },
      });
      if (!giftCard) throw new NotFoundException('Gift card not found');
      if (!giftCard.ownerId) throw new NotFoundException('Gift card business owner not found');
      if (giftCard.soldStatus === BusinessGiftCardSoldStatus.PURCHASED)
        throw new BadRequestException('Gift card already purchased');

      // Find purchaser
      const purchaser = await manager.findOne(User, { where: { id: meta.purchaserId } });
      if (!purchaser) throw new NotFoundException('Purchaser not found');

      // Load business and owner relations after basic validations
      const giftCardWithRelations = await manager.findOne(BusinessGiftCard, {
        where: { id: meta.giftCardId },
        relations: ['business', 'owner'],
      });
      if (!giftCardWithRelations?.owner) throw new NotFoundException('Gift card business owner not found');

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
      await manager.update(Transaction, {
        referenceId: reference,
        service: 'GiftCard-Purchase'
      }, {
        status: TransactionStatus.COMPLETED,
        amount: giftCardAmount
      });

      // Complete platform fee transaction
      await manager.update(Transaction, {
        referenceId: reference,
        service: 'GiftCard-Fee'
      }, {
        status: TransactionStatus.COMPLETED,
        amount: feeAmount
      });

      return {
        giftCard,
        giftCardAmount: giftCardAmount,
        platformFee: feeAmount,
        totalPaid: giftCardAmount + feeAmount,
      };
    });

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
      return { valid: false, reason: 'Gift card fully redeemed' };

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
      throw new BadRequestException('Gift card fully redeemed');

    const amount = Number(giftCard.remainingAmount);

    // Redeem inside a transaction
    return await this.dataSource.manager.transaction(async (manager) => {
      giftCard.remainingAmount = 0;
      giftCard.redeemedAt = now;
      giftCard.status = BusinessGiftCardStatus.USED;

      await manager.save(BusinessGiftCard, giftCard);

      // Log redemption transaction
      const tx = this.transactionRepo.create({
        senderId: giftCard.ownerId,
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
    });
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
      order: { createdAt: 'DESC' },
    });
  }

  /** Get gift card fee from admin platform settings */
  async getGiftCardFee() {
    const paymentsSettings = await this.platformSettingsService.getPayments();
    return { giftCardFee: paymentsSettings.platformFee };
  }
}
