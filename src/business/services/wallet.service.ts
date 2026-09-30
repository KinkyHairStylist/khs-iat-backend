import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
  PLATFORM_LEDGER_CURRENCY,
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
import { EmailService } from 'src/email/email.service';
import { TemplateService } from 'src/email/template.service';
import { NotificationService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/notification.enum';
import { CurrencyConversionService } from './currency-conversion.service';
import { StripeService } from 'src/payment/stripe.service';
import { AirwallexService } from 'src/payment/airwallex.service';

// A manually-curated fee table for the previewWithdrawal disclosure only —
// Airwallex has no no-commitment quote endpoint (confirmed live: both
// /transfers/estimate and /transfers/quote are routed as GET /transfers/{id}
// by the real API, neither is a real endpoint), so the exact fee is only
// ever known for certain once a real transfer is created. This is a stated
// approximation, not authoritative — the real fee is what
// claimAutomaticPayout's Airwallex branch actually reports back. Keyed by
// `${bankCountryCode}_${transferMethod}`; countries/methods not listed here
// show no estimate rather than a guessed number.
const AIRWALLEX_FEE_TABLE: Record<string, { amount: number; currency: string }> = {
  // Confirmed live 2026-09-29: flat, not a percentage (identical on a $10
  // and a $500 test transfer).
  NG_SWIFT: { amount: 14.1, currency: 'USD' },
  // Confirmed live 2026-09-29 — LOCAL transfers (SEPA for the euro
  // countries, Faster Payments for the UK, ACH for the US) were fee-free
  // across every corridor actually tested, unlike the SWIFT fallback above.
  // Real per-corridor test transfers, not assumed from LOCAL being free in
  // just one of them.
  US_LOCAL: { amount: 0, currency: 'USD' },
  GB_LOCAL: { amount: 0, currency: 'GBP' },
  DE_LOCAL: { amount: 0, currency: 'EUR' },
  FR_LOCAL: { amount: 0, currency: 'EUR' },
  ES_LOCAL: { amount: 0, currency: 'EUR' },
  IE_LOCAL: { amount: 0, currency: 'EUR' },
};

// What KHS actually took out of a booking earning before crediting the
// merchant — surfaced on the transaction so they can see it, not just the
// net number that hit their balance.
export interface FeeBreakdown {
  grossAmount: number;
  commissionAmount: number;
  acquisitionFeeAmount: number;
}

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
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
    private readonly notificationService: NotificationService,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly stripeService: StripeService,
    private readonly airwallexService: AirwallexService,
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
        currency: createWalletDto.currency || PLATFORM_LEDGER_CURRENCY,
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

    // Look up the payout method and convert *before* opening the locked
    // transaction below — the conversion is an external HTTP call, and
    // holding a pessimistic row lock on the wallet for the duration of that
    // call would block every other operation on it (including another
    // withdrawal request) until the currency API responds or times out.
    // The payment method is re-checked for real (still this wallet's own,
    // still active) inside the transaction; this pass is only to compute
    // the conversion without holding anything.
    const walletForLookup = await this.walletRepository.findOne({
      where: { businessId: params.businessId },
    });
    if (!walletForLookup) throw new NotFoundException('Wallet not found');
    const bankDetailsForLookup = await this.paymentMethodRepository.findOne({
      where: { id: params.bankDetailsId, walletId: walletForLookup.id, isActive: true },
    });
    if (!bankDetailsForLookup) {
      throw new NotFoundException('Payout account not found for this business');
    }
    if (!bankDetailsForLookup.payoutCurrency) {
      throw new BadRequestException(
        'Add a payout currency to this payment method before withdrawing',
      );
    }
    const conversion = await this.currencyConversionService.convert(
      amount,
      bankDetailsForLookup.payoutCurrency,
    );

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

      // The payout account has to be this wallet's own, and still in use —
      // re-checked here (not just reused from the pre-lock lookup above)
      // in case it changed between that lookup and getting the lock.
      const bankDetails = await manager.findOne(WalletPaymentMethod, {
        where: { id: params.bankDetailsId, walletId: wallet.id, isActive: true },
      });
      if (!bankDetails) {
        throw new NotFoundException('Payout account not found for this business');
      }
      if (bankDetails.payoutCurrency !== bankDetailsForLookup.payoutCurrency) {
        // The merchant changed the payout currency on this method between
        // the lookup above and now — recompute rather than use a stale
        // conversion for a currency they no longer have selected.
        throw new BadRequestException('Payout method changed — please try again');
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
          currency: wallet.currency,
          payoutCurrency: conversion.payoutCurrency === wallet.currency ? null : conversion.payoutCurrency,
          exchangeRate: conversion.payoutCurrency === wallet.currency ? null : conversion.exchangeRate,
          payoutAmount: conversion.payoutCurrency === wallet.currency ? null : conversion.payoutAmount,
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
    }).then(async (result) => {
      // Outside the transaction and never allowed to throw — a failed
      // message must not undo money already moved out of the wallet.
      // Previously nothing told the merchant a request was even submitted;
      // the only confirmation came later, at approve/reject.
      await this.confirmWithdrawalRequested(result.withdrawal);
      return result;
    });
  }

  /**
   * Pure read — no wallet lock, no money moved — so the frontend can call
   * this on every amount keystroke or payout-method change while the
   * merchant is filling in the withdraw form.
   */
  async previewWithdrawal(params: {
    businessId: string;
    amount: number;
    bankDetailsId: string;
  }): Promise<{
    amount: number;
    ledgerCurrency: string;
    payoutCurrency: string;
    exchangeRate: number;
    payoutAmount: number;
    estimatedFee?: number;
    feeCurrency?: string;
  }> {
    const amount = Math.round(Number(params.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Enter an amount greater than zero');
    }

    const wallet = await this.walletRepository.findOne({
      where: { businessId: params.businessId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const bankDetails = await this.paymentMethodRepository.findOne({
      where: { id: params.bankDetailsId, walletId: wallet.id, isActive: true },
    });
    if (!bankDetails) {
      throw new NotFoundException('Payout account not found for this business');
    }
    if (!bankDetails.payoutCurrency) {
      throw new BadRequestException(
        'Add a payout currency to this payment method before withdrawing',
      );
    }

    const conversion = await this.currencyConversionService.convert(
      amount,
      bankDetails.payoutCurrency,
    );

    // Airwallex only: the merchant absorbs any transfer fee (fee_paid_by:
    // BENEFICIARY, decided since KHS's own balance shouldn't carry a
    // corridor-specific cost) — see AIRWALLEX_FEE_TABLE's comment for why
    // this is an estimate, not a quote.
    let estimatedFee: number | undefined;
    let feeCurrency: string | undefined;
    if (
      bankDetails.type === PaymentMethodType.AIRWALLEX_CONNECT &&
      bankDetails.country &&
      bankDetails.airwallexTransferMethod
    ) {
      const fee =
        AIRWALLEX_FEE_TABLE[`${bankDetails.country}_${bankDetails.airwallexTransferMethod}`];
      if (fee) {
        estimatedFee = fee.amount;
        feeCurrency = fee.currency;
      }
    }

    return { amount, ...conversion, estimatedFee, feeCurrency };
  }

  /**
   * The merchant pulls an admin-approved withdrawal to their own Stripe
   * Connect account themselves — the actual transfer fires here, on their
   * action, not when the admin approved it. Locked the same way
   * WithdrawalService.approve is, for the same reason: two clicks on the
   * same withdrawal must not both fire a real transfer.
   */
  async claimAutomaticPayout(withdrawalId: string, user: any): Promise<Withdrawal> {
    await this.withdrawalRepository.manager.transaction(async (manager) => {
      const locked = await manager.findOne(Withdrawal, {
        where: { id: withdrawalId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });
      if (!locked) throw new NotFoundException('Withdrawal not found');

      // Same ownership check as cancelWithdrawal — the wallet's own owner,
      // or staff.
      const wallet = await manager.findOne(Wallet, { where: { businessId: locked.businessId } });
      const userId = user?.id ?? user?.sub;
      if (!user?.isStaff && (!wallet || !userId || wallet.ownerId !== userId)) {
        throw new ForbiddenException('You can only withdraw your own business\'s requests');
      }

      if (locked.status !== 'Processing') {
        throw new BadRequestException(
          `This withdrawal is ${locked.status.toLowerCase()}, not ready to withdraw`,
        );
      }
      // No further changes here — just holding the lock through the
      // ownership/status check above so a second concurrent claim can't
      // slip past it. The real state change happens below, after release.
    });

    const withdrawal = await this.withdrawalRepository.findOne({ where: { id: withdrawalId } });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    const bank = withdrawal.bankDetails;
    const stripeEligible =
      process.env.STRIPE_CONNECT_ENABLED === 'true' &&
      bank?.type === PaymentMethodType.STRIPE_CONNECT &&
      !!bank.stripeAccountId &&
      bank.stripePayoutsEnabled;
    const airwallexEligible =
      process.env.AIRWALLEX_ENABLED === 'true' &&
      bank?.type === PaymentMethodType.AIRWALLEX_CONNECT &&
      !!bank.airwallexBeneficiaryId;

    if (!stripeEligible && !airwallexEligible) {
      throw new BadRequestException(
        'This withdrawal is not set up for self-serve withdrawal — an admin will send it by hand',
      );
    }

    if (stripeEligible) {
      try {
        const transfer = await this.stripeService.createTransfer({
          amount: Math.round(Number(withdrawal.payoutAmount ?? withdrawal.amount) * 100),
          currency: (withdrawal.payoutCurrency ?? withdrawal.currency).toLowerCase(),
          destinationAccountId: bank.stripeAccountId,
          metadata: { withdrawalId: withdrawal.id },
        });
        withdrawal.status = 'Completed';
        withdrawal.payoutMethod = 'stripe';
        withdrawal.payoutReference = transfer.id;
        withdrawal.paidAt = new Date();
      } catch (error) {
        this.logger.error(
          `Merchant-claimed Stripe transfer failed for withdrawal ${withdrawalId}: ${error.message}`,
          error.stack,
        );
        SlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.STRIPE,
          severity: SlackSeverity.ERROR,
          type: SlackEventType.ERROR_ALERT,
          trigger: `Merchant-claimed payout failed: ${withdrawal.businessName}`,
          body: `The merchant tried to withdraw ${withdrawal.id} (${withdrawal.businessName}) to their connected Stripe account and it failed. It's still Processing — they can retry, or send it by hand.
Error: ${error.message}`,
        });
        // Stays Processing — the merchant can see the error and retry, or an
        // admin can still fall back to sending it by hand.
        throw new BadRequestException(
          `Could not send this withdrawal to your Stripe account: ${error.message}`,
        );
      }
    } else {
      // Airwallex: the create call only means "accepted", not "delivered" —
      // see AirwallexService's class doc. Status lands on 'Submitted', not
      // 'Completed', until a refresh (or, later, a webhook) confirms
      // SENT/PAID via handleAirwallexTransferStatus.
      try {
        const transfer = await this.airwallexService.createTransfer({
          amount: Number(withdrawal.payoutAmount ?? withdrawal.amount),
          sourceCurrency: PLATFORM_LEDGER_CURRENCY,
          transferCurrency: withdrawal.payoutCurrency ?? withdrawal.currency,
          beneficiaryId: bank.airwallexBeneficiaryId,
          transferMethod: (bank.airwallexTransferMethod as 'LOCAL' | 'SWIFT') ?? 'SWIFT',
          feePaidBy: 'BENEFICIARY',
          reference: `WD-${withdrawal.id.slice(0, 8).toUpperCase()}`,
          requestId: withdrawal.id,
        });
        withdrawal.status = 'Submitted';
        withdrawal.payoutMethod = 'airwallex';
        withdrawal.payoutReference = transfer.id;
        // paidAt intentionally NOT set yet — only once handleAirwallexTransferStatus confirms it.
      } catch (error) {
        this.logger.error(
          `Merchant-claimed Airwallex transfer failed for withdrawal ${withdrawalId}: ${error.message}`,
          error.stack,
        );
        SlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.SYSTEM,
          severity: SlackSeverity.ERROR,
          type: SlackEventType.ERROR_ALERT,
          trigger: `Merchant-claimed payout failed: ${withdrawal.businessName}`,
          body: `The merchant tried to withdraw ${withdrawal.id} (${withdrawal.businessName}) to their connected Airwallex beneficiary and it failed. It's still Processing — they can retry, or send it by hand.
Error: ${error.message}`,
        });
        throw new BadRequestException(
          `Could not send this withdrawal to your Airwallex account: ${error.message}`,
        );
      }
    }

    const saved = await this.withdrawalRepository.save(withdrawal);

    // Only mark the linked transaction completed once the payout is
    // actually final — for Stripe that's now (this branch only reaches
    // here on success, above), for Airwallex it's still 'Submitted' and
    // handleAirwallexTransferStatus does this instead once confirmed.
    if (saved.status === 'Completed' && saved.transactionId) {
      try {
        await this.transactionRepository.update(
          { id: saved.transactionId },
          { status: TransactionStatus.COMPLETED },
        );
      } catch (error) {
        this.logger.error(
          `Merchant-claimed transfer for withdrawal ${withdrawalId} succeeded but updating its transaction record failed: ${error.message}`,
          error.stack,
        );
        SlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.STRIPE,
          severity: SlackSeverity.ERROR,
          type: SlackEventType.ERROR_ALERT,
          trigger: `Bookkeeping update failed after a successful merchant-claimed payout: ${saved.businessName}`,
          body: `Withdrawal ${saved.id} was successfully sent to the merchant's Stripe account, but its linked transaction record could not be marked completed. Check transaction ${saved.transactionId} by hand.
Error: ${error.message}`,
        });
      }
    }

    this.slack(
      saved,
      stripeEligible
        ? `Merchant withdrew to their own Stripe account: ${saved.businessName}`
        : `Merchant submitted a withdrawal via Airwallex (awaiting confirmation): ${saved.businessName}`,
    );
    return saved;
  }

  /**
   * The merchant-facing (or staff) "Refresh status" action — looks up the
   * withdrawal, checks ownership the same way cancelWithdrawal/
   * claimAutomaticPayout do, reads the real transfer status from Airwallex,
   * and resolves it via handleAirwallexTransferStatus. A no-op (returns the
   * withdrawal unchanged) unless it's currently 'Submitted'.
   */
  async refreshAirwallexWithdrawalStatus(withdrawalId: string, user: any): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({ where: { id: withdrawalId } });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');

    const wallet = await this.walletRepository.findOne({ where: { businessId: withdrawal.businessId } });
    const userId = user?.id ?? user?.sub;
    if (!user?.isStaff && (!wallet || !userId || wallet.ownerId !== userId)) {
      throw new ForbiddenException('You can only refresh your own business\'s withdrawal requests');
    }

    if (withdrawal.status !== 'Submitted' || !withdrawal.payoutReference) {
      return withdrawal;
    }

    const transfer = await this.airwallexService.retrieveTransfer(withdrawal.payoutReference);
    const resolved = await this.handleAirwallexTransferStatus(transfer.id, transfer.status);
    return resolved ?? withdrawal;
  }

  /**
   * Resolves an in-flight Airwallex transfer's real status — called from a
   * merchant-facing "Refresh status" action in this first version (no
   * webhook wired yet, see AirwallexService's class doc). Never throws: an
   * unrecognized transferId is logged and ignored, same as
   * handleStripeAccountUpdated.
   */
  async handleAirwallexTransferStatus(
    transferId: string,
    status: string,
    failureType?: string,
  ): Promise<Withdrawal | null> {
    const withdrawal = await this.withdrawalRepository.findOne({
      where: { payoutReference: transferId, payoutMethod: 'airwallex' },
    });
    if (!withdrawal) {
      this.logger.warn(`Airwallex transfer status update for unrecognized transfer ${transferId}`);
      return null;
    }

    if (withdrawal.status !== 'Submitted') {
      // Already resolved (or moved on some other way) — nothing to do.
      return withdrawal;
    }

    if (status === 'SENT' || status === 'PAID') {
      withdrawal.status = 'Completed';
      withdrawal.paidAt = new Date();
      const saved = await this.withdrawalRepository.save(withdrawal);
      if (saved.transactionId) {
        try {
          await this.transactionRepository.update(
            { id: saved.transactionId },
            { status: TransactionStatus.COMPLETED },
          );
        } catch (error) {
          this.logger.error(
            `Airwallex transfer ${transferId} confirmed but updating its transaction record failed: ${error.message}`,
            error.stack,
          );
        }
      }
      try {
        const wallet = await this.walletRepository.findOne({ where: { businessId: saved.businessId } });
        if (wallet) {
          await this.notificationService.create({
            userId: wallet.ownerId,
            type: NotificationType.SYSTEM,
            title: 'Your payout has been sent',
            message: `Your withdrawal of $${saved.amount} has been sent via Airwallex. Reference: ${saved.payoutReference}.`,
            link: '/merchant/dashboard/wallet',
            metadata: { withdrawalId: saved.id },
          });
        }
      } catch (error) {
        this.logger.error(`Could not notify merchant of confirmed Airwallex payout: ${error.message}`);
      }
      this.slack(saved, `Airwallex payout confirmed sent: ${saved.businessName}`);
      return saved;
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      // Reverts to Processing, not Rejected — the money is still owed; the
      // merchant can retry-claim, or an admin sends it by hand. payoutMethod
      // stays 'airwallex' for audit history even if the retry goes out
      // manually.
      withdrawal.status = 'Processing';
      const saved = await this.withdrawalRepository.save(withdrawal);
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.SYSTEM,
        severity: SlackSeverity.ERROR,
        type: SlackEventType.ERROR_ALERT,
        trigger: `Airwallex payout ${status.toLowerCase()}: ${saved.businessName}`,
        body: `Withdrawal ${saved.id} (${saved.businessName})'s Airwallex transfer ${transferId} came back ${status}${failureType ? ` (${failureType})` : ''}. Reverted to Processing — the merchant can retry, or send it by hand.`,
      });
      return saved;
    }

    // SCHEDULED / PROCESSING — no change, still Submitted.
    return withdrawal;
  }

  // Same Slack-notify shape WithdrawalService uses — kept local rather than
  // shared, since the two classes don't otherwise depend on each other.
  private slack(withdrawal: Withdrawal, trigger: string): void {
    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.PAYMENT_SUCCESS,
      trigger,
      body: `${trigger}
• Business: ${withdrawal.businessName}
• Amount: $${withdrawal.amount}
• Withdrawal ID: ${withdrawal.id}`,
    });
  }

  private async confirmWithdrawalRequested(withdrawal: Withdrawal): Promise<void> {
    try {
      const business = await this.walletRepository.manager.findOne(Business, {
        where: { id: withdrawal.businessId },
        relations: ['owner'],
      });
      const ownerId = business?.ownerId || business?.owner?.id;
      const title = 'Withdrawal Request Received';
      const message = `We've received your withdrawal request for $${withdrawal.amount}. We'll email you again once it's approved and sent.`;

      if (ownerId) {
        await this.notificationService.create({
          userId: ownerId,
          type: NotificationType.SYSTEM,
          title,
          message,
          link: '/merchant/dashboard/wallet',
          metadata: { withdrawalId: withdrawal.id, status: withdrawal.status },
        });
      }

      const to = business?.ownerEmail || business?.owner?.email;
      if (to) {
        const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
        const html = this.templateService.render('communication-bulk', {
          businessName: business?.businessName,
          subject: title,
          clientName: business?.ownerName || 'there',
          message,
          closingRemarks: null,
          frontendUrl,
          year: new Date().getFullYear(),
        });
        this.emailService.sendEmail(to, title, message, html);
      }
    } catch (error) {
      this.logger.error(`Could not confirm withdrawal request ${withdrawal.id} to the salon:`, error);
    }
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
      currency: wallet.currency,
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
        currency: wallet.currency,
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

  /**
   * A hosted Stripe onboarding link for automatic payouts. Creates a Stripe
   * Express account (and its WalletPaymentMethod row) the first time this is
   * called for a wallet; a not-yet-onboarded row is reused rather than
   * creating a second stranded Stripe account. `payoutCurrency` is left null
   * until the account.updated webhook confirms payouts are actually enabled
   * (see handleStripeAccountUpdated) — that alone is what makes an
   * in-progress connection unusable for withdrawal, via the same
   * payoutCurrency guard requestWithdrawal already has.
   */
  async getOrCreateStripeConnectOnboardingLink(params: {
    walletId: string;
    businessId: string;
    payoutCurrency?: WalletCurrency;
  }): Promise<{ url?: string; alreadyConnected?: boolean }> {
    const existing = await this.paymentMethodRepository.findOne({
      where: {
        walletId: params.walletId,
        type: PaymentMethodType.STRIPE_CONNECT,
        isActive: true,
      },
    });

    if (existing?.stripePayoutsEnabled) {
      return { alreadyConnected: true };
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
    const refreshUrl = `${frontendUrl}/merchant/dashboard/wallet?stripeRefresh=1`;
    const returnUrl = `${frontendUrl}/merchant/dashboard/wallet?stripeReturn=1`;

    let stripeAccountId = existing?.stripeAccountId;

    if (!stripeAccountId) {
      const business = await this.walletRepository.manager.findOne(Business, {
        where: { id: params.businessId },
      });
      if (!business) throw new NotFoundException('Business not found');
      if (!business.country) {
        throw new BadRequestException(
          'Add your country in Settings before connecting a payout account',
        );
      }

      const account = await this.stripeService.createConnectedAccount({
        businessId: params.businessId,
        email: business.ownerEmail,
        country: business.country,
        payoutCurrency: params.payoutCurrency,
      });
      stripeAccountId = account.id;

      if (existing) {
        existing.stripeAccountId = stripeAccountId;
        await this.paymentMethodRepository.save(existing);
      } else {
        await this.paymentMethodRepository.save(
          this.paymentMethodRepository.create({
            walletId: params.walletId,
            type: PaymentMethodType.STRIPE_CONNECT,
            stripeAccountId,
            stripePayoutsEnabled: false,
            country: business.country,
            isActive: true,
            isDefault: false,
          }),
        );
      }
    }

    const url = await this.stripeService.createAccountLink({
      accountId: stripeAccountId,
      refreshUrl,
      returnUrl,
    });
    return { url };
  }

  /**
   * The account.updated webhook telling us a connected account's onboarding
   * state changed. Never throws — an event for an account this app doesn't
   * recognize is logged and ignored, not an error.
   */
  async handleStripeAccountUpdated(
    stripeAccountId: string,
    payoutsEnabled: boolean,
    payoutCurrency?: string,
  ): Promise<void> {
    const method = await this.paymentMethodRepository.findOne({
      where: { stripeAccountId, type: PaymentMethodType.STRIPE_CONNECT },
    });
    if (!method) {
      this.logger.warn(`account.updated for unrecognized Stripe account ${stripeAccountId}`);
      return;
    }

    const wasEnabled = method.stripePayoutsEnabled;
    method.stripePayoutsEnabled = payoutsEnabled;
    if (payoutsEnabled && !method.payoutCurrency && payoutCurrency) {
      method.payoutCurrency = payoutCurrency;
    }
    await this.paymentMethodRepository.save(method);

    if (payoutsEnabled && !wasEnabled) {
      const wallet = await this.walletRepository.findOne({ where: { id: method.walletId } });
      if (wallet) {
        try {
          await this.notificationService.create({
            userId: wallet.ownerId,
            type: NotificationType.SYSTEM,
            title: 'Your Stripe payout account is ready',
            message: 'Automatic payouts are now enabled — future approved withdrawals will be sent to it directly.',
            link: '/merchant/dashboard/wallet',
            metadata: { stripeAccountId },
          });
        } catch (error) {
          this.logger.error(`Could not notify merchant of Stripe payouts enabled: ${error.message}`);
        }
      }
    }
  }

  /**
   * Thin passthrough to Airwallex's dynamic form-schema API — lets the
   * frontend fetch the live required-field list for the merchant's own
   * country/currency before rendering the beneficiary form. No DB
   * interaction, safe to call on every country/currency change.
   */
  async getAirwallexFormSchema(params: {
    country: string;
    currency: string;
    transferMethod: 'LOCAL' | 'SWIFT';
    localClearingSystem?: string;
  }) {
    return this.airwallexService.getFormSchema({
      accountCurrency: params.currency,
      bankCountryCode: params.country,
      entityType: 'COMPANY',
      transferMethod: params.transferMethod,
      localClearingSystem: params.localClearingSystem,
    });
  }

  /**
   * Creates the merchant's Airwallex Beneficiary — this IS the "onboarding"
   * for this rail; there's no separate enable step to wait on afterward,
   * unlike Stripe Connect's hosted onboarding + webhook (see
   * airwallexBeneficiaryId's comment on WalletPaymentMethod).
   */
  async createAirwallexBeneficiary(params: {
    walletId: string;
    businessId: string;
    country: string;
    currency: string;
    transferMethod: 'LOCAL' | 'SWIFT';
    localClearingSystem?: string;
    answers: Record<string, unknown>;
  }): Promise<WalletPaymentMethod> {
    const existing = await this.paymentMethodRepository.findOne({
      where: {
        walletId: params.walletId,
        type: PaymentMethodType.AIRWALLEX_CONNECT,
        isActive: true,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'A payout account is already connected via Airwallex for this wallet',
      );
    }

    const beneficiary = await this.airwallexService.createBeneficiary({
      accountCurrency: params.currency,
      bankCountryCode: params.country,
      entityType: 'COMPANY',
      transferMethod: params.transferMethod,
      localClearingSystem: params.localClearingSystem,
      answers: params.answers,
    });

    return this.paymentMethodRepository.save(
      this.paymentMethodRepository.create({
        walletId: params.walletId,
        type: PaymentMethodType.AIRWALLEX_CONNECT,
        airwallexBeneficiaryId: beneficiary.id,
        airwallexBeneficiaryDetails: params.answers,
        airwallexTransferMethod: params.transferMethod,
        // Set immediately, unlike Stripe's — there's nothing to wait for.
        payoutCurrency: params.currency,
        country: params.country,
        isActive: true,
        isDefault: false,
      }),
    );
  }

  /**
   * Attach (or change) a payout currency/country on a payment method that
   * already exists — the only way an account saved before this feature
   * shipped can become usable for withdrawal, short of adding a whole new
   * duplicate one. Never touches the bank/card details themselves.
   */
  async updatePayoutCurrency(
    paymentMethodId: string,
    walletId: string,
    updates: { payoutCurrency: WalletCurrency; country?: string },
  ): Promise<ApiResponse<WalletPaymentMethod>> {
    try {
      const paymentMethod = await this.paymentMethodRepository.findOne({
        where: { id: paymentMethodId, walletId, isActive: true },
      });
      if (!paymentMethod) {
        return {
          success: false,
          error: 'Payment method not found',
          message: 'Payment method not found for this wallet',
        };
      }

      paymentMethod.payoutCurrency = updates.payoutCurrency;
      if (updates.country !== undefined) {
        paymentMethod.country = updates.country;
      }
      const saved = await this.paymentMethodRepository.save(paymentMethod);

      return {
        success: true,
        data: saved,
        message: 'Payout currency updated successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to update payout currency',
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
      transactionList: (Transaction & { feeBreakdown?: FeeBreakdown })[];
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

      // Fee (commission/acquisition) transactions are excluded above so the
      // merchant's ledger only shows what actually moved their balance, but
      // that left them with no way to see what was taken out of an earning
      // and why. Attach each earning's fee breakdown instead, keyed by the
      // referenceId it shares with its fee rows.
      await this.attachFeeBreakdown(transactionList);

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

  // Fee transactions share a referenceId with the earning they were taken
  // from (both created off the same booking/order) — batched into one
  // query rather than looking each one up per row.
  private async attachFeeBreakdown(
    transactionList: (Transaction & { feeBreakdown?: FeeBreakdown })[],
  ): Promise<void> {
    const referenceIds = [
      ...new Set(
        transactionList
          .filter((t) => t.type === TransactionType.EARNING && t.referenceId)
          .map((t) => t.referenceId),
      ),
    ];
    if (referenceIds.length === 0) return;

    const feeRows = await this.transactionRepository.find({
      where: { type: TransactionType.FEE, referenceId: In(referenceIds) },
    });
    if (feeRows.length === 0) return;

    const feesByReference = new Map<string, { commission: number; acquisition: number }>();
    for (const fee of feeRows) {
      const entry = feesByReference.get(fee.referenceId) ?? { commission: 0, acquisition: 0 };
      if (fee.feeSubtype === 'Commission') entry.commission += Number(fee.amount);
      else if (fee.feeSubtype === 'Acquisition') entry.acquisition += Number(fee.amount);
      feesByReference.set(fee.referenceId, entry);
    }

    for (const t of transactionList) {
      const fees = t.referenceId ? feesByReference.get(t.referenceId) : undefined;
      if (!fees) continue;
      const netAmount = Number(t.amount);
      t.feeBreakdown = {
        grossAmount: Math.round((netAmount + fees.commission + fees.acquisition) * 100) / 100,
        commissionAmount: fees.commission,
        acquisitionFeeAmount: fees.acquisition,
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
