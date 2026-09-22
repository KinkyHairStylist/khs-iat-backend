import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../entities/wallet.entity';
import {
  AddPaymentMethodDto,
  AddTransactionDto,
  CreateWalletDto,
  DebitWalletRequestDto,
  TransactionFiltersDto,
  WithdrawalDto,
} from '../dtos/requests/WalletDto';
import { ApiResponse } from '../types/client.types';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
  PaymentMethod,
} from '../entities/transaction.entity';
import {
  PaymentMethodType,
  WalletCurrency,
  WalletStatus,
} from 'src/admin/payment/enums/wallet.enum';
import { WalletPaymentMethod } from '../entities/payment-method.entity';
import { Withdrawal } from 'src/admin/withdrawal/entities/withdrawal.entity';
import { Business } from '../entities/business.entity';
import { StripePaymentIntent } from 'src/payment/entities/stripe-payment-intent.entity';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from '../../utils/enum';

@Injectable()
export class BusinessWalletService {
  private readonly logger = new Logger(BusinessWalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(WalletPaymentMethod)
    private paymentMethodRepository: Repository<WalletPaymentMethod>,
    @InjectRepository(Withdrawal)
    private withdrawalRepository: Repository<Withdrawal>,
    @InjectRepository(StripePaymentIntent)
    private stripePaymentIntentRepository: Repository<StripePaymentIntent>,
  ) {}

  async createWalletForBusiness(
    createWalletDto: CreateWalletDto,
  ): Promise<ApiResponse<Wallet>> {
    try {
      // Check if wallet already exists for this business
      const existingWallet = await this.walletRepository.findOne({
        where: { businessId: createWalletDto.businessId },
      });

      if (existingWallet) {
        return {
          success: false,
          error: 'Wallet already exists for this business',
          message: 'Wallet already exists for this business',
        };
      }

      // Create new wallet
      const wallet = this.walletRepository.create({
        businessId: createWalletDto.businessId,
        ownerId: createWalletDto.ownerId,
        currency: createWalletDto.currency || WalletCurrency.NGN,
        description:
          createWalletDto.description || 'Business wallet - auto-created',
        balance: 0,
        totalIncome: 0,
        totalExpenses: 0,
        pendingBalance: 0,
        status: WalletStatus.ACTIVE,
        isVerified: false,
      });

      const savedWallet = await this.walletRepository.save(wallet);

      return {
        success: true,
        data: savedWallet,
        message: 'Business Wallet created successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to create business wallet',
      };
    }
  }

  /**
   * Get wallet by business ID
   */
  async getWalletByBusinessId(businessId: string): Promise<Wallet> {
    try {
      const wallet = await this.walletRepository.findOne({
        where: { businessId },
        relations: ['transactions', 'paymentMethods', 'business'],
      });

      if (!wallet) {
        throw new BadRequestException(`Wallet not found`);
      }

      return wallet;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to fetch business wallet by Business Id: ${error.message}`,
      );
    }
  }

  /**
   * Get wallet by owner ID
   */
  async getWalletByOwnerId(ownerId: string): Promise<ApiResponse<Wallet>> {
    try {
      const wallet = await this.walletRepository.findOne({
        where: { ownerId },
        relations: ['transactions', 'paymentMethods', 'business'],
      });

      if (!wallet) {
        return {
          success: false,
          error: 'Wallet not found',
          message: 'Wallet not found for this owner',
        };
      }

      return {
        success: true,
        data: wallet,

        message: 'Business Wallet fetched successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch business wallet',
      };
    }
  }

  /**
   * Get wallet by ID with all relations
   */
  async getWalletById(walletId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
      relations: ['transactions', 'paymentMethods'],
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet not found`);
    }

    return wallet;
  }

  /**
   * Get wallet by ID with all relations
   */
  async getTransactionHistoryByWalletId(
    walletId: string,
  ): Promise<Transaction[]> {
    const transactionList = await this.transactionRepository.find({
      where: { walletId },
    });

    if (!transactionList) {
      throw new NotFoundException(`Transaction history not found`);
    }

    return transactionList;
  }

  /**
   * Add funds to wallet (credit transaction)
   */
  async addFunds(addTransactionDto: AddTransactionDto): Promise<Transaction> {
    if (addTransactionDto.type !== TransactionType.EARNING) {
      throw new BadRequestException(
        'Use addFunds for credit transactions only',
      );
    }

    return this.processTransaction(addTransactionDto);
  }

  /**
   * Deduct funds from wallet (debit transaction)
   */
  async deductFunds(debitWalletDto: DebitWalletRequestDto): Promise<any> {
    if (debitWalletDto.transaction.type !== TransactionType.WITHDRAWAL) {
      throw new BadRequestException(
        'Use deductFunds for debit transactions only',
      );
    }

    const result = await this.requestWithdrawal({
      businessId: debitWalletDto.transaction.businessId,
      amount: Number(debitWalletDto.transaction.amount),
      bankDetailsId: debitWalletDto.withdrawal.bankDetailsId,
      description: debitWalletDto.transaction.description,
    });

    // Largest outbound money movement in the system — same shape as the
    // business "goes live" notification (business.service.ts:167).
    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.PAYMENT_ATTEMPT,
      trigger: `Payout requested: ${result.withdrawal.businessName}`,
      body: `A merchant requested a payout. It is waiting for review on Wallets & Payouts.
• Business: ${result.withdrawal.businessName}
• Amount: $${result.withdrawal.amount}
• Reference: ${result.transaction.referenceId}`,
    });

    return result;
  }

  /**
   * A salon asks KHS to pay out part of its available balance. The amount comes off the balance
   * straight away (so it can't be spent twice) and a Pending request is created for KHS to review.
   * Everything happens in one database transaction with the wallet row locked, so two requests made
   * at the same moment can't both use the same money, and a failure part-way leaves nothing behind.
   */
  async requestWithdrawal(params: {
    businessId: string;
    amount: number;
    bankDetailsId: string;
    description?: string;
  }): Promise<{ transaction: Transaction; withdrawal: Withdrawal }> {
    const amount = Math.round(Number(params.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Enter an amount greater than zero');
    }

    return this.walletRepository.manager.transaction(async (manager) => {
      const wallet = await manager.findOne(Wallet, {
        where: { businessId: params.businessId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) throw new NotFoundException('Wallet not found');
      if (wallet.status !== WalletStatus.ACTIVE) {
        throw new BadRequestException('Wallet is not active');
      }
      if (Number(wallet.balance) < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      // The payout account has to be this wallet's own, and still in use.
      const bankDetails = await manager.findOne(WalletPaymentMethod, {
        where: { id: params.bankDetailsId, walletId: wallet.id, isActive: true },
      });
      if (!bankDetails) {
        throw new NotFoundException('Payout account not found for this business');
      }

      const business = await manager.findOne(Business, { where: { id: wallet.businessId } });

      const balanceAfter = Math.round((Number(wallet.balance) - amount) * 100) / 100;
      wallet.balance = balanceAfter;
      wallet.totalExpenses = Number(wallet.totalExpenses) + amount;
      await manager.save(Wallet, wallet);

      const transaction = await manager.save(
        Transaction,
        manager.create(Transaction, {
          walletId: wallet.id,
          amount,
          senderId: wallet.ownerId,
          method: PaymentMethod.BANK,
          type: TransactionType.WITHDRAWAL,
          currency: wallet.currency,
          status: TransactionStatus.PENDING,
          mode: 'Web',
          description: params.description || `Withdrawal request for ${business?.businessName ?? 'business'}`,
        }),
      );

      const withdrawal = await manager.save(
        Withdrawal,
        manager.create(Withdrawal, {
          businessId: wallet.businessId,
          businessName: business?.businessName ?? '',
          bankDetails,
          bankDetailsId: bankDetails.id,
          amount,
          status: 'Pending',
          currentBalance: balanceAfter,
          requestDate: new Date().toISOString(),
          transactionId: transaction.id,
        }),
      );

      // A short reference the salon and KHS can both quote.
      transaction.referenceId = `WD-${withdrawal.id.slice(0, 8).toUpperCase()}`;
      await manager.save(Transaction, transaction);

      return { transaction, withdrawal };
    });
  }

  /**
   * Puts a withdrawal's money back in the wallet and marks its ledger row cancelled. Used when KHS
   * rejects a request and when the salon cancels one. Does not change the withdrawal's own status,
   * the caller does, so it can record the reason.
   */
  async refundWithdrawal(withdrawal: Withdrawal): Promise<void> {
    await this.walletRepository.manager.transaction(async (manager) => {
      const wallet = await manager.findOne(Wallet, {
        where: withdrawal.bankDetails?.walletId
          ? { id: withdrawal.bankDetails.walletId }
          : { businessId: withdrawal.businessId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) throw new NotFoundException('Wallet not found');

      const amount = Number(withdrawal.amount);
      wallet.balance = Math.round((Number(wallet.balance) + amount) * 100) / 100;
      wallet.totalExpenses = Math.max(0, Number(wallet.totalExpenses) - amount);
      await manager.save(Wallet, wallet);

      if (withdrawal.transactionId) {
        await manager.update(
          Transaction,
          { id: withdrawal.transactionId },
          { status: TransactionStatus.CANCELLED },
        );
      }
    });
  }

  /** A salon takes back a withdrawal request that KHS hasn't started on. */
  async cancelWithdrawal(withdrawalId: string, user: any): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({ where: { id: withdrawalId } });
    if (!withdrawal) throw new NotFoundException('Withdrawal request not found');

    const wallet = await this.walletRepository.findOne({ where: { businessId: withdrawal.businessId } });
    const userId = user?.id ?? user?.sub;
    if (!user?.isStaff && (!wallet || !userId || wallet.ownerId !== userId)) {
      throw new ForbiddenException('You can only cancel your own withdrawal requests');
    }
    if (withdrawal.status !== 'Pending') {
      throw new BadRequestException(
        `This request is already ${withdrawal.status.toLowerCase()} and can't be cancelled`,
      );
    }

    await this.refundWithdrawal(withdrawal);
    withdrawal.status = 'Cancelled';
    withdrawal.reviewedAt = new Date();
    return this.withdrawalRepository.save(withdrawal);
  }

  // Stripe-sourced booking earnings sit here before becoming withdrawable
  // — see Wallet.pendingBalance and Transaction.availableAt for why.
  private static readonly PAYOUT_HOLD_HOURS = 48;

  /**
   * Credit funds to the wallet's *pending* balance instead of the live
   * balance — held for PAYOUT_HOLD_HOURS before WalletReleaseCronService
   * moves it to balance. Used only for Stripe-sourced booking completions
   * (BusinessService.completeBooking) — the one path a chargeback can
   * apply to.
   */
  async addFundsPending(addTransactionDto: AddTransactionDto): Promise<Transaction> {
    if (addTransactionDto.type !== TransactionType.EARNING) {
      throw new BadRequestException('addFundsPending is for earning transactions only');
    }

    const wallet = await this.walletRepository.findOne({
      where: { businessId: addTransactionDto.businessId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException('Wallet is not active');
    }

    const availableAt = new Date();
    availableAt.setHours(availableAt.getHours() + BusinessWalletService.PAYOUT_HOLD_HOURS);

    const transaction = this.transactionRepository.create({
      walletId: wallet.id,
      amount: addTransactionDto.amount,
      senderId: addTransactionDto.senderId,
      recipientId: addTransactionDto.recipientId,
      method: addTransactionDto.method,
      type: TransactionType.EARNING,
      referenceId: addTransactionDto.referenceId,
      currency: addTransactionDto.currency,
      status: TransactionStatus.COMPLETED,
      mode: addTransactionDto.mode,
      description: addTransactionDto.description,
      availableAt,
    });
    const saved = await this.transactionRepository.save(transaction);

    wallet.pendingBalance = Number(wallet.pendingBalance) + Number(addTransactionDto.amount);
    wallet.totalIncome = Number(wallet.totalIncome) + Number(addTransactionDto.amount);
    await this.walletRepository.save(wallet);

    return saved;
  }

  /**
   * Debit the business for a lost Stripe dispute (or its $15 fee) — pulls
   * from whatever's still held in pendingBalance first (money never
   * handed out at all), then from the released balance for any
   * remainder, which can go negative. No reserve system prevents that;
   * the payout hold only reduces how often it happens. Called twice by
   * the dispute handler: once for the disputed amount, once for the fee.
   */
  async debitWithPendingFallback(params: {
    businessId: string;
    amount: number;
    type: TransactionType;
    feeSubtype?: Transaction['feeSubtype'];
    referenceId: string;
    description: string;
    senderId?: string;
  }): Promise<Transaction> {
    const wallet = await this.walletRepository.findOne({
      where: { businessId: params.businessId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found for chargeback recovery');
    }

    let remaining = params.amount;
    const fromPending = Math.min(remaining, Number(wallet.pendingBalance));
    if (fromPending > 0) {
      wallet.pendingBalance = Number(wallet.pendingBalance) - fromPending;
      remaining -= fromPending;
    }
    if (remaining > 0) {
      wallet.balance = Number(wallet.balance) - remaining;
    }
    wallet.totalExpenses = Number(wallet.totalExpenses) + Number(params.amount);
    await this.walletRepository.save(wallet);

    return this.transactionRepository.save(
      this.transactionRepository.create({
        walletId: wallet.id,
        amount: params.amount,
        type: params.type,
        feeSubtype: params.feeSubtype ?? null,
        currency: wallet.currency,
        description: params.description,
        referenceId: params.referenceId,
        senderId: params.senderId,
        status: TransactionStatus.COMPLETED,
        mode: 'Web',
        method: PaymentMethod.STRIPE,
      }),
    );
  }

  // Flat per-dispute fee passed to the business, matching what card
  // networks charge KHS's own Stripe account for a dispute existing.
  private static readonly CHARGEBACK_FEE = 15;

  /**
   * A Stripe dispute was permanently lost — recover the disputed amount
   * plus the flat chargeback fee from the business whose booking it was.
   * Called only on `charge.dispute.closed` with status "lost" (a "won"
   * dispute is a no-op elsewhere — nothing was taken from the business
   * prematurely, so nothing needs reversing here).
   */
  async handleChargeback(chargeId: string, disputedAmount: number): Promise<void> {
    const spi = await this.stripePaymentIntentRepository.findOne({
      where: { stripeChargeId: chargeId },
    });
    if (!spi) {
      this.logger.warn(`No StripePaymentIntent found for disputed charge ${chargeId} — ignoring`);
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.ERROR,
        type: SlackEventType.ERROR_ALERT,
        trigger: `Chargeback for charge ${chargeId}`,
        body: `A Stripe dispute was lost for charge ${chargeId}, but no matching StripePaymentIntent exists — the disputed amount ($${disputedAmount}) could not be recovered from any business. KHS absorbs this loss.`,
      });
      return;
    }

    try {
      await this.debitWithPendingFallback({
        businessId: spi.businessId,
        amount: disputedAmount,
        type: TransactionType.DEBIT,
        referenceId: spi.stripePaymentIntentId,
        description: `Chargeback recovered for order tied to charge ${chargeId}`,
        senderId: spi.userId,
      });

      await this.debitWithPendingFallback({
        businessId: spi.businessId,
        amount: BusinessWalletService.CHARGEBACK_FEE,
        type: TransactionType.FEE,
        feeSubtype: 'ChargebackFee',
        referenceId: spi.stripePaymentIntentId,
        description: `Chargeback fee for order tied to charge ${chargeId}`,
        senderId: spi.userId,
      });

      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.CRITICAL,
        type: SlackEventType.PAYMENT_FAILURE,
        trigger: `Chargeback for charge ${chargeId}`,
        body: `A Stripe dispute was lost — $${disputedAmount} plus a $${BusinessWalletService.CHARGEBACK_FEE} chargeback fee were debited from business ${spi.businessId}'s wallet.
• Charge: ${chargeId}
• Order: ${spi.stripePaymentIntentId}
• Business: ${spi.businessId}`,
      });
    } catch (err) {
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.CRITICAL,
        type: SlackEventType.ERROR_ALERT,
        trigger: `Chargeback for charge ${chargeId}`,
        body: `Failed to debit business ${spi.businessId} for a lost Stripe dispute — the $${disputedAmount} charge plus $${BusinessWalletService.CHARGEBACK_FEE} fee were NOT recovered. Manual intervention needed.
• Charge: ${chargeId}
• Order: ${spi.stripePaymentIntentId}
• Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }
  }

  /**
   * Process a transaction (credit or debit)
   */
  private async processTransaction(
    addTransactionDto: AddTransactionDto,
  ): Promise<Transaction> {
    try {
      const wallet = await this.walletRepository.findOne({
        where: { businessId: addTransactionDto.businessId },
        relations: ['business'],
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (wallet.status !== WalletStatus.ACTIVE) {
        throw new BadRequestException('Wallet is not active');
      }

      // Create transaction
      const transaction: Transaction = this.transactionRepository.create({
        walletId: wallet.id,
        amount:
          addTransactionDto.type === TransactionType.EARNING
            ? addTransactionDto.amount
            : addTransactionDto.amount,
        senderId: addTransactionDto.senderId,
        method: addTransactionDto.method,
        type: addTransactionDto.type,
        recipientId:
          addTransactionDto.type === TransactionType.EARNING
            ? addTransactionDto.recipientId
            : undefined,
        referenceId: addTransactionDto.referenceId,
        currency: addTransactionDto.currency,
        status:
          addTransactionDto.type === TransactionType.EARNING
            ? TransactionStatus.COMPLETED
            : TransactionStatus.PENDING,
        mode: addTransactionDto.mode,
        description: addTransactionDto.description,
      });

      const savedTransaction =
        await this.transactionRepository.save(transaction);

      if (!savedTransaction) {
        throw new InternalServerErrorException('Failed to save transaction');
      }

      // Update wallet balance
      if (addTransactionDto.type === TransactionType.EARNING) {
        wallet.balance =
          Number(wallet.balance) + Number(addTransactionDto.amount);
        wallet.totalIncome =
          Number(wallet.totalIncome) + Number(addTransactionDto.amount);
      } else {
        wallet.balance =
          Number(wallet.balance) - Number(addTransactionDto.amount);
        wallet.totalExpenses =
          Number(wallet.totalExpenses) + Number(addTransactionDto.amount);
      }

      await this.walletRepository.save(wallet);

      return savedTransaction;
    } catch (error) {
      throw new InternalServerErrorException(
        `Transaction failed: ${error.message}`,
      );
    }
  }

  async addPayPalPaymentMethod(
    walletId: string,
    paypalEmail: string,
    isDefault: boolean = true,
  ): Promise<WalletPaymentMethod> {
    const wallet = await this.getWalletById(walletId);

    // Check if PayPal already exists for this wallet
    const existingPayPal = await this.paymentMethodRepository.findOne({
      where: {
        walletId: wallet.id,
        type: PaymentMethodType.DIGITAL_WALLET,
        provider: 'PayPal',
      },
    });

    if (existingPayPal) {
      throw new BadRequestException(
        'PayPal payment method already exists for this wallet',
      );
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await this.paymentMethodRepository.update(
        { walletId: wallet.id, isDefault: true },
        { isDefault: false },
      );
    }

    // Create PayPal payment method
    const paymentMethod = this.paymentMethodRepository.create({
      walletId: wallet.id,
      type: PaymentMethodType.DIGITAL_WALLET,
      provider: 'PayPal',
      accountNumber: paypalEmail,
      isDefault: isDefault,
      isActive: true,
    });

    return this.paymentMethodRepository.save(paymentMethod);
  }

  async addPaymentMethod(
    addPaymentMethodDto: AddPaymentMethodDto,
  ): Promise<ApiResponse<WalletPaymentMethod>> {
    try {
      const wallet = await this.getWalletById(addPaymentMethodDto.walletId);

      // If this is set as default, unset other defaults
      if (addPaymentMethodDto.isDefault) {
        await this.paymentMethodRepository.update(
          { walletId: wallet.id, isDefault: true },
          { isDefault: false },
        );
      }

      const paymentMethod = this.paymentMethodRepository.create({
        ...addPaymentMethodDto,
      });

      const newPaymentMethod =
        await this.paymentMethodRepository.save(paymentMethod);

      return {
        success: true,
        data: newPaymentMethod,
        message: 'Payment Method added successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to add payment method to business',
      };
    }
  }

  async getAvailablePaymentMethodTypes(): Promise<
    Array<{
      type: PaymentMethodType;
      name: string;
      description: string;
      isEnabled: boolean;
    }>
  > {
    return [
      {
        type: PaymentMethodType.DIGITAL_WALLET,
        name: 'PayPal',
        description: 'Pay with your PayPal account',
        isEnabled: true,
      },
      {
        type: PaymentMethodType.BANK_ACCOUNT,
        name: 'Bank Account',
        description: 'Direct bank account transfer',
        isEnabled: false, // Can enable when implemented
      },
      {
        type: PaymentMethodType.CREDIT_CARD,
        name: 'Credit Card',
        description: 'Pay with credit card',
        isEnabled: false, // Can enable when implemented
      },
      {
        type: PaymentMethodType.DEBIT_CARD,
        name: 'Debit Card',
        description: 'Pay with debit card',
        isEnabled: false, // Can enable when implemented
      },
    ];
  }

  /**
   * Get all payment methods for a wallet
   */
  async getPaymentMethods(
    walletId: string,
  ): Promise<ApiResponse<WalletPaymentMethod[]>> {
    try {
      await this.getWalletById(walletId); // Validate wallet exists

      const paymentMethods = await this.paymentMethodRepository.find({
        where: { walletId, isActive: true },
        order: { isDefault: 'DESC', createdAt: 'DESC' },
      });

      return {
        success: true,
        data: paymentMethods,
        message: 'Payment Methods list retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch payment methods',
      };
    }
  }

  /**
   * Get all withdrawals for a business
   */
  async getBusinessWithdrawals(
    businessId: string,
  ): Promise<ApiResponse<Withdrawal[]>> {
    try {
      const withdrawals = await this.withdrawalRepository.find({
        where: { businessId },
        order: { createdAt: 'DESC' },
      });

      return {
        success: true,
        data: withdrawals,
        message: 'Business Withdrawals list retrieved successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch Business Withdrawals',
      };
    }
  }

  /**
   * Remove payment method
   */
  async removePaymentMethod(paymentMethodId: string): Promise<void> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: paymentMethodId },
    });

    if (!paymentMethod) {
      throw new NotFoundException('Payment method not found');
    }

    // Soft delete by marking as inactive
    paymentMethod.isActive = false;
    await this.paymentMethodRepository.save(paymentMethod);
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(
    paymentMethodId: string,
  ): Promise<WalletPaymentMethod> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: paymentMethodId },
    });

    if (!paymentMethod) {
      throw new NotFoundException('Payment method not found');
    }

    // Unset other defaults for this wallet
    await this.paymentMethodRepository.update(
      { walletId: paymentMethod.walletId, isDefault: true },
      { isDefault: false },
    );

    // Set this as default
    paymentMethod.isDefault = true;
    return this.paymentMethodRepository.save(paymentMethod);
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(walletId: string): Promise<number> {
    const wallet = await this.getWalletById(walletId);
    return Number(wallet.balance);
  }

  /**
   * Update wallet status
   */
  async updateWalletStatus(
    walletId: string,
    status: WalletStatus,
  ): Promise<Wallet> {
    const wallet = await this.getWalletById(walletId);
    wallet.status = status;
    return this.walletRepository.save(wallet);
  }

  /**
   * Get transaction history for a wallet
   */
  async getTransactionHistory(
    walletId: string,
    filters: TransactionFiltersDto,
  ): Promise<
    ApiResponse<{
      transactionList: Transaction[];
      meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        startIndex: number;
        endIndex: number;
      };
    }>
  > {
    try {
      const {
        page = 1,
        limit = 10,
        type,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = filters;

      const queryBuilder =
        this.transactionRepository.createQueryBuilder('transaction');

      /* --------- FILTER BY WALLETID ---------- */
      queryBuilder.andWhere('transaction.walletId = :walletId', {
        walletId,
      });

      /* --------- EXCLUDE FEE TRANSACTIONS ---------- */
      queryBuilder.andWhere('transaction.type != :feeType', {
        feeType: TransactionType.FEE,
      });

      /* --------- RELATIONS ---------- */
      queryBuilder.leftJoinAndSelect('transaction.sender', 'sender');

      /* --------- FILTERS ---------- */
      if (type && type !== 'All') {
        queryBuilder.andWhere('transaction.type = :type', { type });
      }

      /* --------- SORTING (APPLIED ONCE!) ---------- */

      // Otherwise follow user-defined sortBy and sortOrder
      queryBuilder.orderBy(
        `transaction.${sortBy}`,
        sortOrder.toUpperCase() as 'ASC' | 'DESC',
      );

      /* --------- PAGINATION ---------- */
      const skip = (page - 1) * limit;
      queryBuilder.skip(skip).take(limit);

      /* --------- EXECUTE ---------- */
      const [transactionList, total] = await queryBuilder.getManyAndCount();

      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit + 1;
      const endIndex = Math.min(page * limit, total);

      // const transactionList = await this.transactionRepository.find({
      //   where: { walletId },
      //   order: { createdAt: 'DESC' },
      //   relations: ['sender'],
      //   take: limit,
      // });

      return {
        success: true,
        data: {
          transactionList,
          meta: {
            total,
            page,
            limit,
            totalPages,
            startIndex,
            endIndex,
          },
        },
        message: 'Transaction history fetched',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to fetch Transaction history',
      };
    }
  }

  /**
   * Create a new withdrawal request
   */
  private async createWithdrawal(
    bankDetails: WalletPaymentMethod,
    dto: AddTransactionDto,
    businessName: string,
    currentWalletBalance: number,
  ): Promise<Withdrawal> {
    // Create withdrawal
    const withdrawal = this.withdrawalRepository.create({
      businessId: dto.businessId,
      businessName,
      currentBalance: currentWalletBalance - dto.amount,
      bankDetails,
      amount: dto.amount,
      status: 'Pending',
      requestDate: new Date().toISOString(),
    });

    //
    return await this.withdrawalRepository.save(withdrawal);
  }
}
