import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  Transaction,
  TransactionStatus,
} from 'src/business/entities/transaction.entity';
import { Business } from 'src/business/entities/business.entity';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import { Withdrawal } from './entities/withdrawal.entity';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from 'src/utils/enum';
import { EmailService } from 'src/email/email.service';
import { TemplateService } from 'src/email/template.service';
import { NotificationService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/notification.enum';
import { StripeService } from 'src/payment/stripe.service';
import { PaymentMethodType } from 'src/admin/payment/enums/wallet.enum';

type WithdrawalStatus = Withdrawal['status'];

// A withdrawal is a request from a salon for KHS to pay out part of its wallet:
//
//   Pending     the salon asked (the amount is already off its balance)
//   Processing  KHS approved it and is sending the money
//   Completed   KHS sent it and recorded the transfer reference
//   Rejected    KHS refused it (with a reason); the amount went back to the wallet
//   Cancelled   the salon took the request back before KHS started (see BusinessWalletService)
//
// Approving does NOT send money. KHS sends it (a bank transfer) and then marks the request paid with
// the reference, and only then is the salon told it has been sent.
@Injectable()
export class WithdrawalService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepo: Repository<Withdrawal>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    private readonly walletService: BusinessWalletService,
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
    private readonly notificationService: NotificationService,
    private readonly stripeService: StripeService,
  ) {}

  private readonly logger = new Logger(WithdrawalService.name);

  private assertStatus(withdrawal: Withdrawal, allowed: WithdrawalStatus[]): void {
    if (!allowed.includes(withdrawal.status)) {
      throw new BadRequestException(
        `This withdrawal request is already ${withdrawal.status.toLowerCase()}`,
      );
    }
  }

  // Tells the salon, in the app and by email. Never throws: a failed message must not undo a decision.
  private async tellMerchant(
    withdrawal: Withdrawal,
    title: string,
    message: string,
  ): Promise<void> {
    try {
      const business = await this.businessRepo.findOne({
        where: { id: withdrawal.businessId },
        relations: ['owner'],
      });
      const ownerId = business?.ownerId || business?.owner?.id;
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
      console.error(`Could not tell the salon about withdrawal ${withdrawal.id}:`, error);
    }
  }

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

  async findAll(): Promise<Withdrawal[]> {
    return this.withdrawalRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepo.findOne({ where: { id } });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    return withdrawal;
  }

  async getPending(): Promise<Withdrawal[]> {
    return this.withdrawalRepo.find({ where: { status: 'Pending' } });
  }

  // Requests KHS still has to act on: waiting for review, or approved and waiting to be paid.
  async getOpen(): Promise<Withdrawal[]> {
    return this.withdrawalRepo.find({
      where: { status: In(['Pending', 'Processing']) },
      order: { createdAt: 'ASC' },
    });
  }

  // KHS accepts the request — this is purely the compliance/review sign-off,
  // it never moves money itself. Once approved: a merchant with an enabled
  // Stripe Connect payout method sees it as ready in their own wallet and
  // claims it themselves (see BusinessWalletService.claimAutomaticPayout,
  // called from a merchant-facing endpoint) — the actual transfer fires on
  // THEIR action, not this one. Anyone without that fires nothing here
  // either; an admin still sends it by hand and marks it paid, unchanged.
  async approve(id: string): Promise<Withdrawal> {
    // Locked in its own short transaction — two concurrent Approve clicks (a
    // slow double-click, two admins on the same queue) must not both pass
    // the Pending check. `loadEagerRelations: false` here on purpose:
    // Postgres can't apply FOR UPDATE across bankDetails' outer join, so
    // this locks only the withdrawals row — bankDetails is re-loaded via
    // the plain findOne below, after the lock is already released.
    await this.withdrawalRepo.manager.transaction(async (manager) => {
      const locked = await manager.findOne(Withdrawal, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });
      if (!locked) throw new NotFoundException('Withdrawal not found');
      this.assertStatus(locked, ['Pending']);

      locked.status = 'Processing';
      locked.reviewedAt = new Date();
      await manager.save(Withdrawal, locked);
    });

    const saved = await this.findOne(id); // bankDetails eager-loaded here
    const canGoAutomatic =
      process.env.STRIPE_CONNECT_ENABLED === 'true' &&
      saved.bankDetails?.type === PaymentMethodType.STRIPE_CONNECT &&
      !!saved.bankDetails.stripeAccountId &&
      saved.bankDetails.stripePayoutsEnabled;

    this.slack(
      saved,
      canGoAutomatic
        ? `Payout approved: ${saved.businessName}. Ready for the merchant to withdraw via Stripe.`
        : `Payout approved: ${saved.businessName}. It now needs to be sent and marked paid.`,
    );
    await this.tellMerchant(
      saved,
      'Your withdrawal was approved',
      canGoAutomatic
        ? `Your withdrawal request for $${saved.amount} has been approved and is ready — withdraw it to your Stripe account any time from your wallet.`
        : `Your withdrawal request for $${saved.amount} has been approved. We are preparing the transfer and will email you again, with a reference, as soon as it has been sent.`,
    );
    return saved;
  }

  // KHS has sent the money and records how to trace it.
  async markPaid(id: string, reference: string): Promise<Withdrawal> {
    const cleaned = (reference ?? '').trim();
    if (!cleaned) {
      throw new BadRequestException('Enter the transfer reference');
    }

    const withdrawal = await this.findOne(id);
    if (withdrawal.payoutMethod !== 'manual') {
      throw new BadRequestException(
        'This payout was sent automatically — nothing to mark paid by hand',
      );
    }
    this.assertStatus(withdrawal, ['Processing']);

    withdrawal.status = 'Completed';
    withdrawal.payoutReference = cleaned;
    withdrawal.paidAt = new Date();
    const saved = await this.withdrawalRepo.save(withdrawal);

    if (saved.transactionId) {
      await this.transactionRepo.update(
        { id: saved.transactionId },
        { status: TransactionStatus.COMPLETED },
      );
    }

    this.slack(saved, `Payout sent: ${saved.businessName} (reference ${cleaned})`);
    await this.tellMerchant(
      saved,
      'Your payout has been sent',
      `Your withdrawal of $${saved.amount} has been sent to your payout account. Transfer reference: ${cleaned}. It can take a few business days to show in your account.`,
    );
    return saved;
  }

  // KHS refuses the request; the amount goes back to the wallet and the salon is told why.
  async reject(id: string, reason: string): Promise<Withdrawal> {
    const cleaned = (reason ?? '').trim();
    if (!cleaned) {
      throw new BadRequestException('Give a reason for rejecting the request');
    }

    const withdrawal = await this.findOne(id);
    this.assertStatus(withdrawal, ['Pending', 'Processing']);

    await this.walletService.refundWithdrawal(withdrawal);

    withdrawal.status = 'Rejected';
    withdrawal.rejectionReason = cleaned;
    withdrawal.reviewedAt = new Date();
    const saved = await this.withdrawalRepo.save(withdrawal);

    this.slack(saved, `Payout rejected: ${saved.businessName}`);
    await this.tellMerchant(
      saved,
      'Your withdrawal request was declined',
      `Your withdrawal request for $${saved.amount} was declined: ${cleaned}. The amount has been put back in your wallet balance.`,
    );
    return saved;
  }
}
