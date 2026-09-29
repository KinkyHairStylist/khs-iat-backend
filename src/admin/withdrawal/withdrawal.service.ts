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

  // KHS accepts the request. If the payout account is a Stripe Connect
  // account with payouts enabled, this now actually sends the money — a
  // real stripe.transfers.create call, not just a status flip. Anything
  // else (no Stripe account, not yet enabled, or the transfer itself
  // throwing) falls back to exactly the historical manual behavior: only
  // the status flips, an admin sends it by hand and marks it paid later.
  async approve(id: string): Promise<Withdrawal> {
    // Claim it under a row lock first, in its own short transaction — two
    // concurrent Approve clicks (a slow double-click, two admins on the same
    // queue) must not both pass the Pending check and both fire a real
    // Stripe transfer. `loadEagerRelations: false` here on purpose: Postgres
    // can't apply FOR UPDATE across bankDetails' outer join, so this locks
    // only the withdrawals row itself — bankDetails is re-loaded via the
    // plain findOne below, after the lock is already released. The transfer
    // attempt further down intentionally happens outside this transaction
    // entirely (an external HTTP call must never run inside a held row lock).
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

    const withdrawal = await this.findOne(id); // bankDetails eager-loaded here
    const bank = withdrawal.bankDetails;
    const canGoAutomatic =
      process.env.STRIPE_CONNECT_ENABLED === 'true' &&
      bank?.type === PaymentMethodType.STRIPE_CONNECT &&
      !!bank.stripeAccountId &&
      bank.stripePayoutsEnabled;

    if (canGoAutomatic) {
      try {
        // Only a failure of the transfer ITSELF should fall back to manual —
        // once Stripe confirms the money actually moved, nothing after this
        // point may undo payoutMethod/status back to 'manual', or a
        // successful automatic payout would be mislabeled as one an admin
        // still needs to send by hand.
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
        // Never leave it half-done — fall back to the manual path an admin
        // can still complete by hand.
        this.logger.error(
          `Automatic payout failed for withdrawal ${id}, falling back to manual: ${error.message}`,
          error.stack,
        );
        withdrawal.payoutMethod = 'manual';
        SlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.STRIPE,
          severity: SlackSeverity.ERROR,
          type: SlackEventType.ERROR_ALERT,
          trigger: `Automatic payout failed: ${withdrawal.businessName}`,
          body: `The automatic Stripe transfer for withdrawal ${withdrawal.id} (${withdrawal.businessName}) failed and fell back to manual. Send it by hand and mark it paid.
Error: ${error.message}`,
        });
      }

      // Separate from the transfer itself: a failure here means the transfer
      // genuinely succeeded but our own bookkeeping didn't update — log and
      // alert, but don't touch payoutMethod/status, which already correctly
      // reflect that the money moved.
      if (withdrawal.status === 'Completed' && withdrawal.transactionId) {
        try {
          await this.transactionRepo.update(
            { id: withdrawal.transactionId },
            { status: TransactionStatus.COMPLETED },
          );
        } catch (error) {
          this.logger.error(
            `Stripe transfer for withdrawal ${id} succeeded but updating its transaction record failed: ${error.message}`,
            error.stack,
          );
          SlackService.notify({
            node: SlackNode.PAYMENT,
            provider: SlackProvider.STRIPE,
            severity: SlackSeverity.ERROR,
            type: SlackEventType.ERROR_ALERT,
            trigger: `Bookkeeping update failed after a successful payout: ${withdrawal.businessName}`,
            body: `The automatic Stripe transfer for withdrawal ${withdrawal.id} succeeded, but its linked transaction record could not be marked completed. Check transaction ${withdrawal.transactionId} by hand.
Error: ${error.message}`,
          });
        }
      }
    }
    // else: no automatic rail available — payoutMethod stays 'manual',
    // status stays 'Processing', identical to today's behavior.

    const saved = await this.withdrawalRepo.save(withdrawal);

    this.slack(
      saved,
      saved.status === 'Completed'
        ? `Payout sent automatically via Stripe: ${saved.businessName}`
        : `Payout approved: ${saved.businessName}. It now needs to be sent and marked paid.`,
    );
    await this.tellMerchant(
      saved,
      'Your withdrawal was approved',
      saved.status === 'Completed'
        ? `Your withdrawal of $${saved.amount} has been sent. Reference: ${saved.payoutReference}.`
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
