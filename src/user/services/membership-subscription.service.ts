import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MembershipSubscription } from '../user_entities/membership-subscription.entity';
import { MembershipTier } from '../user_entities/membership-tier.entity';
import { SubscribeMembershipDto } from '../dtos/subscribe-membership.dto';
import { User } from 'src/all_user_entities/user.entity';
import { Card } from 'src/all_user_entities/card.entity';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { BusinessGiftCardStatus } from 'src/business/enum/gift-card.enum';
import { Transaction, TransactionType, TransactionStatus, PaymentMethod } from 'src/business/entities/transaction.entity';
import { PaystackService } from 'src/payment/paystack.service';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';
import { PlatformSettingsService } from 'src/admin/platform-settings/platform-settings.service';

@Injectable()
export class MembershipService {
  constructor(
    @InjectRepository(MembershipSubscription)
    private readonly subscriptionRepo: Repository<MembershipSubscription>,

    @InjectRepository(MembershipTier)
    private readonly tierRepo: Repository<MembershipTier>,

    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectRepository(BusinessGiftCard)
    private readonly giftCardRepo: Repository<BusinessGiftCard>,

    private readonly dataSource: DataSource,
    private readonly paystack: PaystackService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  // ------------------------------------------------------
  // Step 1 — Initialize Subscription (Creates PENDING transaction)
  // ------------------------------------------------------
  async subscribe(user: User, dto: SubscribeMembershipDto) {
    const tier = await this.tierRepo.findOne({ where: { id: dto.tierId } });
    if (!tier) throw new BadRequestException('Invalid membership tier');

    const existing = await this.subscriptionRepo.findOne({
      where: { userId: user.id, status: 'active' },
    });

    if (existing) {
      throw new BadRequestException('You already have an active subscription');
    }

    // Get platform fee percentage
    const paymentsSettings = await this.platformSettingsService.getPayments();
    const platformFeePercent = Number(paymentsSettings.platformFee) || 0;

    // Calculate subscription amount and fee
    const subscriptionAmount = Number(tier.initialPrice);
    const feeAmount = subscriptionAmount * (platformFeePercent / 100);
    const totalAmount = subscriptionAmount + feeAmount;
    
    // Round to 2 decimal places to ensure amount is integer when converted to kobo
    const roundedTotalAmount = Math.round(totalAmount * 100) / 100;

    // Handle gift card payment if provided
    let giftCardPayment = 0;
    let remainingToPay = roundedTotalAmount;

    if (dto.giftCard) {
      const giftCard = await this.giftCardRepo.findOne({
        where: { code: dto.giftCard },
      });

      if (!giftCard) throw new BadRequestException('Gift card not found');
      if (giftCard.status !== BusinessGiftCardStatus.ACTIVE) throw new BadRequestException('Gift card is not active');
      if (giftCard.remainingAmount <= 0) throw new BadRequestException('Gift card has no balance');

      giftCardPayment = Math.min(giftCard.remainingAmount, roundedTotalAmount);
      remainingToPay = roundedTotalAmount - giftCardPayment;
    }

    // If remaining amount exists and no card ID provided, throw error
    if (remainingToPay > 0 && !dto.cardId) {
      throw new BadRequestException('Payment method required for remaining amount');
    }

    // If there's remaining amount, validate card
    let card: Card | null = null;
    if (remainingToPay > 0 && dto.cardId) {
      card = await this.cardRepo.findOne({
        where: { id: dto.cardId },
        relations: ['user'],
      });

      if (!card) throw new NotFoundException('Payment card not found');
      if (card.user?.id !== user.id)
        throw new ForbiddenException('You cannot use this payment method');
    }

    // Generate subscription reference
    const reference = `MEM-${Math.floor(1000000 + Math.random() * 9000000)}`;

    // Handle full gift card payment
    if (remainingToPay === 0) {
      // Complete subscription immediately with gift card
      return await this.dataSource.manager.transaction(async (manager) => {
        const giftCard = await manager.findOne(BusinessGiftCard, {
          where: { code: dto.giftCard },
        });

        if (!giftCard || giftCard.remainingAmount < totalAmount) {
          throw new BadRequestException('Insufficient gift card balance');
        }

        // Deduct from gift card
        giftCard.remainingAmount -= totalAmount;
        if (giftCard.remainingAmount === 0) {
          giftCard.status = BusinessGiftCardStatus.USED;
          giftCard.redeemedAt = new Date();
        }
        await manager.save(BusinessGiftCard, giftCard);

        // Create subscription
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + tier.durationDays);

        const nextBillingDate = new Date(startDate);
        nextBillingDate.setDate(startDate.getDate() + 30);

        const subscription = manager.create(MembershipSubscription, {
          userId: user.id,
          tierId: tier.id,
          startDate,
          endDate,
          remainingSessions: tier.session,
          status: 'active',
          nextBillingDate,
          monthlyCost: tier.initialPrice,
        });

        await manager.save(MembershipSubscription, subscription);

        // Create transaction for gift card payment
        const giftCardTx = manager.create(Transaction, {
          senderId: user.id,
          recipientId: undefined, // System/platform
          amount: subscriptionAmount,
          type: TransactionType.DEBIT,
          currency: WalletCurrency.AUD,
          description: `Membership subscription payment for ${tier.name}`,
          mode: 'Web',
          referenceId: reference,
          status: TransactionStatus.COMPLETED,
          method: PaymentMethod.GIFTCARD,
          service: 'Membership-Subscription',
          customerName: `${user.firstName} ${user.surname}`,
        });

        await manager.save(Transaction, giftCardTx);

        // Create transaction for platform fee
        if (feeAmount > 0) {
          const feeTx = manager.create(Transaction, {
            senderId: user.id,
            recipientId: undefined, // Platform fee
            amount: feeAmount,
            type: TransactionType.FEE,
            currency: WalletCurrency.AUD,
            description: `Platform fee for membership subscription ${tier.name}`,
            mode: 'Web',
            referenceId: reference,
            status: TransactionStatus.COMPLETED,
            method: PaymentMethod.GIFTCARD,
            service: 'Membership-Fee',
            customerName: `${user.firstName} ${user.surname}`,
          });

          await manager.save(Transaction, feeTx);
        }

        return {
          message: 'Membership subscription completed successfully with gift card',
          subscription,
          giftCardAmountUsed: totalAmount,
          success: true,
        };
      });
    }

    // Handle partial/combined payment (gift card + card)
    let paystackInit: { reference: string; authorization_url: string } | null = null;
    if (remainingToPay > 0) {
      paystackInit = await this.paystack.initializePayment({
        email: user.email,
        amount: Math.round(remainingToPay * 100), // Convert to kobo and round to integer
        callback_url: `${process.env.NEXT_PUBLIC_BASE_URL}customer/membership/complete?reference=${reference}`,
        metadata: {
          subscriptionTierId: tier.id,
          userId: user.id,
          cardId: dto.cardId,
          giftCard: dto.giftCard,
          giftCardAmount: giftCardPayment,
          subscriptionAmount: subscriptionAmount,
          feeAmount: feeAmount,
          reference: reference,
        },
      });

      if (!paystackInit?.reference)
        throw new BadRequestException('Unable to initialize payment');
    }

    // Create pending transactions
    const transactions: Transaction[] = [];

    // Transaction for gift card portion
    if (giftCardPayment > 0) {
      const giftCardTx = this.transactionRepo.create({
        senderId: user.id,
        recipientId: undefined,
        amount: giftCardPayment,
        type: TransactionType.DEBIT,
        currency: WalletCurrency.AUD,
        description: `Gift card portion for membership subscription ${tier.name}`,
        mode: 'Web',
        referenceId: reference,
        status: TransactionStatus.PENDING,
        method: PaymentMethod.GIFTCARD,
        service: 'Membership-Subscription',
        customerName: `${user.firstName} ${user.surname}`,
      });
      transactions.push(giftCardTx);
    }

    // Transaction for card portion
    if (remainingToPay > 0) {
      const cardTx = this.transactionRepo.create({
        senderId: user.id,
        recipientId: undefined,
        amount: remainingToPay,
        type: TransactionType.DEBIT,
        currency: WalletCurrency.AUD,
        description: `Card payment for membership subscription ${tier.name}`,
        mode: 'Web',
        referenceId: paystackInit!.reference,
        status: TransactionStatus.PENDING,
        method: PaymentMethod.PAYSTACK,
        service: 'Membership-Subscription',
        customerName: `${user.firstName} ${user.surname}`,
      });
      transactions.push(cardTx);
    }

    // Transaction for platform fee
    if (feeAmount > 0) {
      const feeTx = this.transactionRepo.create({
        senderId: user.id,
        recipientId: undefined,
        amount: feeAmount,
        type: TransactionType.FEE,
        currency: WalletCurrency.AUD,
        description: `Platform fee for membership subscription ${tier.name}`,
        mode: 'Web',
        referenceId: reference,
        status: TransactionStatus.PENDING,
        method: PaymentMethod.PAYSTACK,
        service: 'Membership-Fee',
        customerName: `${user.firstName} ${user.surname}`,
      });
      transactions.push(feeTx);
    }

    await this.transactionRepo.save(transactions);

    return {
      message: remainingToPay > 0 ? 'Payment initialized' : 'Subscription initialized',
      subscriptionAmount: subscriptionAmount,
      platformFee: feeAmount,
      totalAmount: totalAmount,
      giftCardAmountUsed: giftCardPayment,
      cardAmountToPay: remainingToPay,
      authorizationUrl: paystackInit?.authorization_url || null,
      reference: reference,
    };
  }

  // ------------------------------------------------------
  // Step 2 — Complete Subscription (Verify Payment & Create Subscription)
  // ------------------------------------------------------
  async completeSubscription(reference: string) {
    // Verify payment
    const verification = await this.paystack.verifyPayment(reference);

    if (!verification || verification.status !== 'success') {
      await this.transactionRepo.update(
        { referenceId: reference },
        { status: TransactionStatus.FAILED },
      );
      throw new BadRequestException('Payment verification failed');
    }

    const meta = verification.metadata;
    const subscriptionAmount = Number(meta.subscriptionAmount) || 0;
    const feeAmount = Number(meta.feeAmount) || 0;
    const giftCardAmount = Number(meta.giftCardAmount) || 0;

    // Start DB transaction
    const result = await this.dataSource.manager.transaction(async (manager) => {
      // Find tier
      const tier = await manager.findOne(MembershipTier, {
        where: { id: meta.subscriptionTierId },
      });
      if (!tier) throw new NotFoundException('Membership tier not found');

      // Find user
      const user = await manager.findOne(User, { where: { id: meta.userId } });
      if (!user) throw new NotFoundException('User not found');

      // Check if user already has active subscription
      const existing = await manager.findOne(MembershipSubscription, {
        where: { userId: user.id, status: 'active' },
      });

      if (existing) {
        throw new BadRequestException('You already have an active subscription');
      }

      // Handle gift card portion if any
      if (meta.giftCard && giftCardAmount > 0) {
        const giftCard = await manager.findOne(BusinessGiftCard, {
          where: { code: meta.giftCard },
        });

        if (!giftCard) throw new BadRequestException('Gift card not found');

        giftCard.remainingAmount -= giftCardAmount;
        if (giftCard.remainingAmount === 0) {
          giftCard.status = BusinessGiftCardStatus.USED;
          giftCard.redeemedAt = new Date();
        }
        await manager.save(BusinessGiftCard, giftCard);

        // Update gift card transaction to COMPLETED
        await manager.update(Transaction, {
          referenceId: meta.reference,
          service: 'Membership-Subscription',
          method: PaymentMethod.GIFTCARD,
        }, {
          status: TransactionStatus.COMPLETED,
        });
      }

      // Create subscription
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + tier.durationDays);

      const nextBillingDate = new Date(startDate);
      nextBillingDate.setDate(startDate.getDate() + 30);

      const subscription = manager.create(MembershipSubscription, {
        userId: user.id,
        tierId: tier.id,
        startDate,
        endDate,
        remainingSessions: tier.session,
        status: 'active',
        nextBillingDate,
        monthlyCost: tier.initialPrice,
      });

      await manager.save(MembershipSubscription, subscription);

      // Update card payment transaction to COMPLETED
      await manager.update(Transaction, {
        referenceId: reference,
        service: 'Membership-Subscription',
        method: PaymentMethod.PAYSTACK,
      }, {
        status: TransactionStatus.COMPLETED,
      });

      // Update platform fee transaction to COMPLETED
      if (feeAmount > 0) {
        await manager.update(Transaction, {
          referenceId: meta.reference,
          service: 'Membership-Fee',
        }, {
          status: TransactionStatus.COMPLETED,
        });
      }

      return {
        subscription,
        subscriptionAmount: subscriptionAmount,
        platformFee: feeAmount,
        giftCardAmountUsed: giftCardAmount,
        cardAmountUsed: verification.amount / 100, // Convert from kobo
        totalPaid: (verification.amount / 100) + giftCardAmount,
      };
    });

    return {
      message: 'Membership subscription completed successfully',
      ...result,
    };
  }

  // Get all subscriptions for a user
  async getUserSubscriptions(userId: string) {
    return this.subscriptionRepo.find({ where: { userId } });
  }

  // Get active subscription for a user
  async getUserSubscription(userId: string) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId, status: 'active' },
      relations: ['tier'],
    });

    if (!subscription) {
      throw new NotFoundException('No active membership found.');
    }

    return subscription;
  }

  // Cancel active membership
  async cancelMembership(userId: string) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId, status: 'active' },
    });

    if (!subscription) {
      throw new NotFoundException('No active membership found.');
    }

    subscription.status = 'cancelled';
    subscription.endDate = new Date();
    subscription.cancelledAt = new Date(); // Record cancellation timestamp

    await this.subscriptionRepo.save(subscription);

    return { message: 'Membership cancelled successfully.' };
  }

  // Upgrade membership to next available tier
  async upgradeMembership(userId: string) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId, status: 'active' },
      relations: ['tier'],
    });

    if (!subscription) {
      throw new NotFoundException('No active membership found.');
    }

    const allTiers = await this.tierRepo.find({ order: { initialPrice: 'ASC' } });
    const currentIndex = allTiers.findIndex(t => t.id === subscription.tier.id);

    if (currentIndex === -1 || currentIndex === allTiers.length - 1) {
      throw new BadRequestException('You are already at the highest membership tier.');
    }

    const nextTier = allTiers[currentIndex + 1];

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + nextTier.durationDays * 24 * 60 * 60 * 1000);

    const nextBillingDate = new Date(startDate);
    nextBillingDate.setDate(startDate.getDate() + 30);

    subscription.tier = nextTier;
    subscription.tierId = nextTier.id;
    subscription.startDate = startDate;
    subscription.endDate = endDate;
    subscription.remainingSessions = nextTier.session;
    subscription.monthlyCost = nextTier.initialPrice;
    subscription.nextBillingDate = nextBillingDate;

    await this.subscriptionRepo.save(subscription);

    return { message: `Successfully upgraded to ${nextTier.name} tier.` };
  }

  // Downgrade membership to previous available tier
  async downgradeMembership(userId: string) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId, status: 'active' },
      relations: ['tier'],
    });

    if (!subscription) {
      throw new NotFoundException('No active membership found.');
    }

    const allTiers = await this.tierRepo.find({ order: { initialPrice: 'ASC' } });
    const currentIndex = allTiers.findIndex(t => t.id === subscription.tier.id);

    if (currentIndex === -1 || currentIndex === 0) {
      throw new BadRequestException('You are already at the lowest membership tier.');
    }

    const previousTier = allTiers[currentIndex - 1];

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + previousTier.durationDays * 24 * 60 * 60 * 1000);

    const nextBillingDate = new Date(startDate);
    nextBillingDate.setDate(startDate.getDate() + 30);

    subscription.tier = previousTier;
    subscription.tierId = previousTier.id;
    subscription.startDate = startDate;
    subscription.endDate = endDate;
    subscription.remainingSessions = previousTier.session;
    subscription.monthlyCost = previousTier.initialPrice;
    subscription.nextBillingDate = nextBillingDate;

    await this.subscriptionRepo.save(subscription);

    return { message: `Successfully downgraded to ${previousTier.name} tier.` };
  }
}
