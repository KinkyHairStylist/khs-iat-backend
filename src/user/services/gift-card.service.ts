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
import { StripeService } from 'src/payment/stripe.service';
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
import { NotificationService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/notification.enum';

// The salon a gift card belongs to, as needed to tell it about a sale.
type SoldBy = {
  ownerId?: string;
  businessName?: string;
  ownerEmail?: string;
  ownerName?: string;
  owner?: { email?: string; firstName?: string; surname?: string };
};

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
    private readonly stripeService: StripeService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly emailService: EmailService,
    private readonly slackService: SlackService,
    private readonly notificationService: NotificationService,
  ) {}

  // ------------------------------------------------------
  // Step 1 — Initialize Purchase via Stripe (Creates PaymentIntent + PENDING transactions)
  //
  // No money moves and no ownership changes here — the gift card stays
  // AVAILABLE until the client actually confirms the PaymentIntent via
  // Stripe Elements. completeGiftCardPurchase() (below) is what flips
  // ownership, credits the wallet, and sends the emails, and it is only
  // called after Stripe reports the intent as succeeded.
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

    // Get platform fee percentage
    const paymentsSettings = await this.platformSettingsService.getPayments();
    const platformFeePercent = Number(paymentsSettings.platformFee) || 0;

    // Calculate gift card amount and fee
    const giftCardAmount = Number(giftCard.amount);
    const feeAmount = giftCardAmount * (platformFeePercent / 100);
    const totalAmount = giftCardAmount + feeAmount;
    const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

    // Ensure purchaser profile is fully loaded (for receipt_email / metadata)
    const buyer =
      (await this.dataSource.getRepository(User).findOne({
        where: { id: purchaser.id },
      })) || purchaser;
    const buyerEmail = buyer.email || purchaser.email;
    const buyerFullName =
      `${buyer.firstName ?? purchaser.firstName ?? ''} ${buyer.surname ?? purchaser.surname ?? ''}`.trim() ||
      'Valued Customer';

    // Create Stripe PaymentIntent — client confirms it via Stripe Elements.
    // Recipient/sender/message ride on the metadata so the complete step
    // can assign them without another API call from the client.
    const paymentIntent = await this.stripeService.createPaymentIntent({
      amount: Math.round(roundedTotalAmount * 100), // cents
      currency: (giftCard.currency || 'usd').toLowerCase(),
      customerEmail: buyerEmail,
      metadata: {
        giftCardId: giftCard.id,
        giftCardCode: giftCard.code,
        purchaserId: purchaser.id,
        cardId: dto.cardId ?? '',
        giftCardAmount,
        feeAmount,
        recipientName: dto.recipientName ?? '',
        recipientEmail: dto.recipientEmail ?? '',
        senderName: dto.fullName ?? buyerFullName,
        message: dto.message ?? '',
      },
    });

    const reference = paymentIntent.id;

    // Save PENDING transactions keyed by the PaymentIntent id — completion
    // flips these to COMPLETED (or FAILED if the intent never succeeds).
    const giftCardTx = this.transactionRepo.create({
      senderId: purchaser.id,
      recipientId: giftCard.business?.ownerId,
      amount: giftCardAmount,
      type: TransactionType.DEBIT,
      currency: (giftCard.currency as any) || WalletCurrency.USD,
      description: `Purchase of gift card "${giftCard.title}"`,
      mode: 'Web',
      referenceId: reference,
      status: TransactionStatus.PENDING,
      method: PaymentMethod.STRIPE,
      service: 'GiftCard-Purchase',
      customerName: `${purchaser.firstName} ${purchaser.surname}`,
    });
    await this.transactionRepo.save(giftCardTx);

    if (feeAmount > 0) {
      const feeTx = this.transactionRepo.create({
        senderId: purchaser.id,
        amount: feeAmount,
        type: TransactionType.FEE,
        currency: (giftCard.currency as any) || WalletCurrency.USD,
        description: `Platform fee for gift card "${giftCard.title}" purchase`,
        mode: 'Web',
        referenceId: reference,
        status: TransactionStatus.PENDING,
        method: PaymentMethod.STRIPE,
        service: 'GiftCard-Fee',
        customerName: `${purchaser.firstName} ${purchaser.surname}`,
      });
      await this.transactionRepo.save(feeTx);
    }

    return {
      message: 'Payment initialized',
      giftCardAmount,
      platformFee: feeAmount,
      totalAmount: roundedTotalAmount,
      clientSecret: paymentIntent.client_secret,
      reference,
      // Kept for FE backwards compatibility — a null authorizationUrl
      // tells the FE to use the inline Stripe form flow instead of the
      // hosted-redirect flow (the old Paystack path).
      authorizationUrl: null,
    };
  }

  // ------------------------------------------------------
  // Step — Complete Purchase (Verify Stripe PaymentIntent + assign ownership)
  //
  // `reference` here is a Stripe PaymentIntent id (pi_...). We only mutate
  // state once the intent is confirmed succeeded — this is safe to call
  // more than once (the PURCHASED short-circuit below makes it idempotent
  // so a duplicate FE retry, or a webhook + FE both calling, won't
  // double-credit the wallet or double-send the emails).
  // ------------------------------------------------------
  async completeGiftCardPurchase(reference: string) {
    // Verify the intent via Stripe
    const intent = await this.stripeService.retrievePaymentIntent(reference);

    const meta = (intent?.metadata ?? {}) as Record<string, string>;

    if (!intent || intent.status !== 'succeeded') {
      const giftCardId = meta.giftCardId;
      if (giftCardId) {
        await this.giftCardRepo.update(
          { id: giftCardId },
          { soldStatus: BusinessGiftCardSoldStatus.AVAILABLE },
        );
      }
      await this.transactionRepo.update(
        { referenceId: reference },
        { status: TransactionStatus.FAILED },
      );
      throw new BadRequestException('Payment verification failed');
    }

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

        // Idempotency: if already PURCHASED (e.g. FE retry or webhook +
        // FE both firing), return the current state instead of erroring
        // or double-mutating.
        if (giftCard.soldStatus === BusinessGiftCardSoldStatus.PURCHASED) {
          return {
            giftCard,
            giftCardAmount,
            platformFee: feeAmount,
            totalPaid: giftCardAmount + feeAmount,
            alreadyCompleted: true,
            business: undefined as SoldBy | undefined,
          };
        }

        // Find purchaser
        const purchaser = await manager.findOne(User, {
          where: { id: meta.purchaserId },
        });
        if (!purchaser) throw new NotFoundException('Purchaser not found');

        // Load business and owner relations after basic validations
        const giftCardWithRelations = await manager.findOne(BusinessGiftCard, {
          where: { id: meta.giftCardId },
          relations: ['business', 'business.owner', 'owner'],
        });
        if (!giftCardWithRelations?.business)
          throw new NotFoundException('Gift card business not found');

        // Assign gift card ownership + recipient details (which we
        // deliberately did not persist at init time, since we might have
        // needed to release the card back to AVAILABLE if the payment
        // never confirmed).
        const buyerEmail = purchaser.email;
        const buyerFullName =
          `${purchaser.firstName ?? ''} ${purchaser.surname ?? ''}`.trim() ||
          'Valued Customer';

        const expiry = new Date();
        expiry.setDate(expiry.getDate() + (giftCard.expiryInDays || 365));

        giftCard.ownerId = purchaser.id;
        giftCard.ownerEmail = buyerEmail;
        giftCard.ownerFullName = buyerFullName;
        giftCard.cardId = meta.cardId || undefined;
        giftCard.soldStatus = BusinessGiftCardSoldStatus.PURCHASED;
        giftCard.status = BusinessGiftCardStatus.ACTIVE;
        giftCard.remainingAmount = giftCardAmount;
        giftCard.recipientName = meta.recipientName || 'No name provided';
        giftCard.recipientEmail = meta.recipientEmail || 'No Email provided';
        giftCard.message = meta.message || '';
        giftCard.senderName = meta.senderName || buyerFullName;
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
          business: giftCardWithRelations.business as SoldBy | undefined,
        };
      },
    );

    // Idempotency short-circuit — if the DB transaction saw the card was
    // already PURCHASED we've already credited the wallet + sent emails
    // on the first successful call; do not repeat.
    if (result.alreadyCompleted) {
      return {
        message: 'Gift card purchase already completed',
        giftCard: result.giftCard,
        giftCardAmount: result.giftCardAmount,
        platformFee: result.platformFee,
        totalPaid: result.totalPaid,
      };
    }

    // The salon is credited the card's full value now. KHS's commission and acquisition fee are
    // taken when the card is spent on a booking, on the whole booking.

    // Update business wallet outside the transaction to avoid deadlock
    try {
      await this.walletService.addFunds({
        businessId: result.giftCard.businessId,
        recipientId: result.giftCard.ownerId!,
        senderId: meta.purchaserId,
        amount: result.giftCardAmount,
        type: TransactionType.EARNING,
        description: `Business Gift card purchase via Stripe`,
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

    // Tell the salon its gift card was sold and that the money is in its wallet.
    try {
      if (result.business?.ownerId) {
        await this.notificationService.create({
          userId: result.business.ownerId,
          type: NotificationType.SYSTEM,
          title: 'Gift card sold',
          message: `${result.giftCard.ownerFullName || 'A customer'} bought your gift card "${result.giftCard.title}" for $${result.giftCardAmount.toFixed(2)}. The amount has been added to your wallet.`,
          link: '/merchant/dashboard/gift-management',
          metadata: {
            giftCardId: result.giftCard.id,
            businessId: result.giftCard.businessId,
            amount: result.giftCardAmount,
          },
        });
      }
    } catch (notifyError) {
      console.error('Failed to notify the salon of a gift card sale:', notifyError);
    }

    // Email the salon too. The email service copies the KHS team; if the salon has no email on
    // file the KHS team gets it on its own.
    try {
      const salon = result.business;
      const merchantEmail = salon?.ownerEmail || salon?.owner?.email;
      const to = merchantEmail || this.emailService.khsTeamEmail;
      if (to) {
        const merchantName =
          salon?.ownerName ||
          `${salon?.owner?.firstName ?? ''} ${salon?.owner?.surname ?? ''}`.trim() ||
          'Salon Owner';
        this.emailService.sendMerchantGiftCardSoldEmail(
          to,
          merchantName,
          salon?.businessName || 'your salon',
          result.giftCard.ownerFullName || 'A customer',
          result.giftCard.title,
          result.giftCardAmount,
        );
      }
    } catch (emailError) {
      console.error('Failed to email the salon about a gift card sale:', emailError);
    }

    // Send Slack notification
    try {
      this.slackService.notify(
        `🎁 *Gift Card Purchased*\n` +
        `• *Card*: "${result.giftCard.title}" (\`${result.giftCard.code}\`)\n` +
        `• *Salon*: ${result.business?.businessName || 'N/A'}\n` +
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
    if (giftCard.status !== BusinessGiftCardStatus.ACTIVE)
      return { valid: false, reason: 'Gift card is not active' };
    if (dto.businessId && giftCard.businessId !== dto.businessId)
      return { valid: false, reason: 'Gift card is for a different salon', reasonCode: 'wrong_salon' };

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

    // Unsold salon stock and deactivated cards cannot be redeemed.
    if (
      giftCard.soldStatus !== BusinessGiftCardSoldStatus.PURCHASED ||
      giftCard.status === BusinessGiftCardStatus.INACTIVE
    )
      throw new BadRequestException('Gift card is not active');
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
  async getAllAvailableBusinessGiftCards(businessId?: string) {
    return this.giftCardRepo.find({
      where: {
        soldStatus: BusinessGiftCardSoldStatus.AVAILABLE,
        status: BusinessGiftCardStatus.ACTIVE,
        ...(businessId ? { businessId } : {}),
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
