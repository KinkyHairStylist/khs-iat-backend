import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, LessThan, Repository } from 'typeorm';
import {
  MerchantSubscription,
  MerchantSubscriptionStatus,
} from '../entities/merchant-subscription.entity';
import { Business, BusinessStatus } from '../entities/business.entity';
import { StripeService } from '../../payment/stripe.service';
import { EmailService } from '../../email/email.service';
import { SlackService } from '../../services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from '../../utils/enum';

const PAST_DUE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MerchantSubscriptionCronService {
  private readonly logger = new Logger(MerchantSubscriptionCronService.name);

  constructor(
    @InjectRepository(MerchantSubscription)
    private readonly merchantSubscriptionRepo: Repository<MerchantSubscription>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly stripeService: StripeService,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailySweep(): Promise<void> {
    await this.sweepTrialReminders();
    await this.sweepExpiredTrials();
    await this.sweepPastDueGracePeriod();
  }

  // Advance warning before sweepExpiredTrials would otherwise suspend a
  // business with zero notice — a merchant's first sign anything was wrong
  // used to be the "your account has been suspended" email on the day it
  // actually happened. Two independent reminders (5 days out, 1 day out),
  // each with its own sent-at flag so a merchant on a daily-run cron never
  // gets either one twice, even across a missed run. Runs before
  // sweepExpiredTrials in the same sweep so a trial ending today still
  // gets its 1-day reminder this run, not just the suspension.
  private async sweepTrialReminders(): Promise<void> {
    await this.sweepTrialReminder(5, 'trialReminder5DaySentAt');
    await this.sweepTrialReminder(1, 'trialReminder1DaySentAt');
  }

  private async sweepTrialReminder(
    thresholdDays: number,
    sentAtColumn: 'trialReminder5DaySentAt' | 'trialReminder1DaySentAt',
  ): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + thresholdDays * DAY_MS);

    const due = await this.merchantSubscriptionRepo.find({
      where: {
        status: MerchantSubscriptionStatus.TRIALING,
        trialEndsAt: Between(now, windowEnd),
        [sentAtColumn]: IsNull(),
      } as any,
    });

    for (const sub of due) {
      // Already has a card on file -- the trial ending doesn't suspend
      // anything for them (Stripe's webhook carries them straight into a
      // paid period), so a "your trial is ending" warning would just be
      // confusing noise. Mirrors sweepExpiredTrials's own check.
      if (sub.stripeSubscriptionId) continue;
      if (!sub.trialEndsAt) continue;

      const business = await this.businessRepo.findOne({ where: { id: sub.businessId } });
      if (!business) continue;

      const daysLeft = Math.max(
        1,
        Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS),
      );

      try {
        this.emailService.sendMerchantTrialEndingSoonEmail(
          business.ownerEmail || '',
          business.businessName,
          daysLeft,
          sub.trialEndsAt,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send ${thresholdDays}-day trial reminder email for business ${business.id}: ${error.message}`,
        );
      }

      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.INFO,
        type: SlackEventType.SUBSCRIPTION_UPDATE,
        trigger: `Trial ending in ${daysLeft} day${daysLeft === 1 ? '' : 's'}: ${business.businessName}`,
        body: `A merchant's free trial is ending soon and no payment method is on file yet.
• Business: ${business.businessName}
• Days left: ${daysLeft}
• Trial ends: ${sub.trialEndsAt.toISOString()}`,
      });

      (sub as any)[sentAtColumn] = now;
      await this.merchantSubscriptionRepo.save(sub);

      this.logger.log(
        `Sent ${thresholdDays}-day trial reminder for business ${business.id} (${daysLeft} days left).`,
      );
    }
  }

  // Trial ran out and the merchant never attached a card at all.
  private async sweepExpiredTrials(): Promise<void> {
    const expired = await this.merchantSubscriptionRepo.find({
      where: {
        status: MerchantSubscriptionStatus.TRIALING,
        trialEndsAt: LessThan(new Date()),
      },
    });

    for (const sub of expired) {
      if (sub.stripeSubscriptionId) continue; // has a card, webhook will handle it
      await this.suspendForBilling(sub, 'trial_expired_no_payment_method');
    }
  }

  // A paid subscription's renewal failed and the grace period has elapsed.
  // Independent of Stripe's own retry schedule — enforces KHS's own
  // access-control invariant on its own, shorter timeline.
  private async sweepPastDueGracePeriod(): Promise<void> {
    const graceCutoff = new Date();
    graceCutoff.setDate(graceCutoff.getDate() - PAST_DUE_GRACE_DAYS);

    const overdue = await this.merchantSubscriptionRepo.find({
      where: {
        status: MerchantSubscriptionStatus.PAST_DUE,
        pastDueSince: LessThan(graceCutoff),
      },
    });

    for (const sub of overdue) {
      if (sub.stripeSubscriptionId) {
        try {
          await this.stripeService.cancelSubscription(sub.stripeSubscriptionId);
        } catch (error) {
          this.logger.error(
            `Failed to cancel Stripe subscription ${sub.stripeSubscriptionId} during grace-period sweep: ${error.message}`,
          );
          // The business is suspended below regardless of this failure —
          // meaning Stripe keeps billing a merchant KHS has already cut off.
          SlackService.notify({
            node: SlackNode.PAYMENT,
            provider: SlackProvider.STRIPE,
            severity: SlackSeverity.ERROR,
            type: SlackEventType.ERROR_ALERT,
            trigger: `Stripe subscription cancel failed (${sub.businessId})`,
            body: `Failed to cancel Stripe subscription ${sub.stripeSubscriptionId} during the grace-period sweep — the business is being suspended anyway, so Stripe will keep billing a suspended merchant until this is fixed manually.
• Business: ${sub.businessId}
• Error: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      await this.suspendForBilling(sub, 'payment_failed_grace_period_exceeded');
    }
  }

  private async suspendForBilling(
    sub: MerchantSubscription,
    cancelReason: string,
  ): Promise<void> {
    sub.status = MerchantSubscriptionStatus.CANCELED;
    sub.cancelReason = cancelReason;
    await this.merchantSubscriptionRepo.save(sub);

    const business = await this.businessRepo.findOne({ where: { id: sub.businessId } });
    if (!business) return;

    business.status = BusinessStatus.SUSPENDED;
    await this.businessRepo.save(business);

    this.logger.log(`Business ${business.id} suspended (${cancelReason}).`);

    try {
      this.emailService.sendMerchantSubscriptionLapsedEmail(
        business.ownerEmail || '',
        business.businessName,
        cancelReason,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send subscription-lapsed email for business ${business.id}: ${error.message}`,
      );
    }

    // A business going live posts to Slack (business.service.ts) — going
    // dark for non-payment previously didn't.
    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.STRIPE,
      severity: SlackSeverity.INFO,
      type: SlackEventType.SUBSCRIPTION_CANCEL,
      trigger: `Business suspended for billing: ${business.businessName}`,
      body: `A merchant's storefront was suspended for non-payment.
• Business: ${business.businessName}
• Reason: ${cancelReason}`,
    });
  }
}
