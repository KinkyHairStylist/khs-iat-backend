import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  MerchantSubscription,
  MerchantSubscriptionKind,
  MerchantSubscriptionStatus,
} from '../entities/merchant-subscription.entity';
import { Business, BusinessPlanTier, BusinessStatus } from '../entities/business.entity';
import { StripeService } from '../../payment/stripe.service';
import { EmailService } from '../../email/email.service';
import { TemplateService } from '../../email/template.service';
import { SlackService } from '../../services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from '../../utils/enum';

const TRIAL_DAYS = 14;

@Injectable()
export class MerchantSubscriptionService {
  private readonly logger = new Logger(MerchantSubscriptionService.name);

  constructor(
    @InjectRepository(MerchantSubscription)
    private readonly merchantSubscriptionRepo: Repository<MerchantSubscription>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly stripeService: StripeService,
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
  ) {}

  // Called from admin approveApplication. Idempotent — a reject→reapprove
  // cycle must not grant a second free trial, so an existing row for this
  // business is returned unchanged rather than recreated.
  //
  // `manager`: when the caller is already inside a DB transaction (so the
  // business-status save and this subscription insert commit or roll back
  // together), pass its EntityManager here. The Stripe Customer API call
  // itself always happens first, outside any transaction — it can't
  // participate in one, and an orphaned Stripe Customer if the later DB
  // write fails is an accepted, low-cost edge case.
  async startTrialForBusiness(
    business: Business,
    manager?: EntityManager,
    trialDays: number = TRIAL_DAYS,
  ): Promise<MerchantSubscription> {
    const repo = manager
      ? manager.getRepository(MerchantSubscription)
      : this.merchantSubscriptionRepo;

    const existing = await repo.findOne({ where: { businessId: business.id } });
    if (existing) {
      this.logger.log(
        `Business ${business.id} already has a subscription record (status: ${existing.status}) — skipping trial creation.`,
      );
      return existing;
    }

    const stripeCustomer = await this.stripeService.createCustomerForBusiness({
      businessId: business.id,
      email: business.ownerEmail,
      name: business.businessName,
    });

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const subscription = repo.create({
      businessId: business.id,
      status: MerchantSubscriptionStatus.TRIALING,
      kind: MerchantSubscriptionKind.TRIAL,
      trialEndsAt,
      stripeCustomerId: stripeCustomer.id,
    });
    return repo.save(subscription);
  }

  // Sign-up chose to pay now: the merchant's Stripe customer and subscription were
  // created (and charged) before the business existed; this records them.
  async recordPaidSignup(
    business: Business,
    stripe: { customerId: string; subscriptionId: string; currentPeriodEnd: Date | null },
    manager?: EntityManager,
  ): Promise<MerchantSubscription> {
    const repo = manager
      ? manager.getRepository(MerchantSubscription)
      : this.merchantSubscriptionRepo;
    const subscription = repo.create({
      businessId: business.id,
      status: MerchantSubscriptionStatus.ACTIVE,
      kind: MerchantSubscriptionKind.PAID,
      trialEndsAt: null,
      currentPeriodEnd: stripe.currentPeriodEnd,
      stripeCustomerId: stripe.customerId,
      stripeSubscriptionId: stripe.subscriptionId,
    });
    return repo.save(subscription);
  }

  // Sign-up chose the free window: access runs to the window's shared end date, not a
  // fixed number of days from joining.
  async recordRevealSignup(
    business: Business,
    windowEndsAt: Date,
    manager?: EntityManager,
  ): Promise<MerchantSubscription> {
    const repo = manager
      ? manager.getRepository(MerchantSubscription)
      : this.merchantSubscriptionRepo;
    const stripeCustomer = await this.stripeService.createCustomerForBusiness({
      businessId: business.id,
      email: business.ownerEmail,
      name: business.businessName,
    });
    const subscription = repo.create({
      businessId: business.id,
      status: MerchantSubscriptionStatus.TRIALING,
      kind: MerchantSubscriptionKind.REVEAL,
      trialEndsAt: windowEndsAt,
      stripeCustomerId: stripeCustomer.id,
    });
    return repo.save(subscription);
  }

  // An admin added days to the free window: everyone still inside it moves to the new
  // end date. Only rows still trialing are touched, so a merchant the sweep already
  // lapsed is not silently revived.
  async moveRevealEnd(newEnd: Date): Promise<number> {
    const result = await this.merchantSubscriptionRepo
      .createQueryBuilder()
      .update(MerchantSubscription)
      .set({ trialEndsAt: newEnd })
      .where('kind = :kind', { kind: MerchantSubscriptionKind.REVEAL })
      .andWhere('status = :status', { status: MerchantSubscriptionStatus.TRIALING })
      .execute();
    return result.affected ?? 0;
  }

  async getForBusiness(businessId: string): Promise<MerchantSubscription | null> {
    return this.merchantSubscriptionRepo.findOne({ where: { businessId } });
  }

  // How each business started and where its billing stands, for the admin business list.
  async summariesFor(businessIds: string[]): Promise<
    Map<
      string,
      {
        kind: MerchantSubscriptionKind;
        status: MerchantSubscriptionStatus;
        trialEndsAt: Date | null;
        currentPeriodEnd: Date | null;
      }
    >
  > {
    const summaries = new Map();
    if (businessIds.length === 0) return summaries;
    const rows = await this.merchantSubscriptionRepo.find({ where: { businessId: In(businessIds) } });
    for (const row of rows) {
      summaries.set(row.businessId, {
        kind: row.kind,
        status: row.status,
        trialEndsAt: row.trialEndsAt,
        currentPeriodEnd: row.currentPeriodEnd,
      });
    }
    return summaries;
  }

  // Number of merchants per starting option, for the admin plan settings.
  async countByKind(): Promise<Record<MerchantSubscriptionKind, number>> {
    const rows = await this.merchantSubscriptionRepo
      .createQueryBuilder('s')
      .select('s.kind', 'kind')
      .addSelect('COUNT(*)', 'n')
      .groupBy('s.kind')
      .getRawMany<{ kind: MerchantSubscriptionKind; n: string }>();
    const counts = {
      [MerchantSubscriptionKind.TRIAL]: 0,
      [MerchantSubscriptionKind.REVEAL]: 0,
      [MerchantSubscriptionKind.PAID]: 0,
    };
    for (const r of rows) counts[r.kind] = Number(r.n);
    return counts;
  }

  // The application was rejected after the merchant paid at sign-up: stop billing and
  // give the money back in full. A merchant who never paid (trial / free window) has
  // nothing to refund.
  async cancelAndRefundForRejection(
    businessId: string,
  ): Promise<{ refunded: boolean; refundId: string | null }> {
    const sub = await this.merchantSubscriptionRepo.findOne({ where: { businessId } });
    if (!sub || sub.kind !== MerchantSubscriptionKind.PAID || !sub.stripeSubscriptionId) {
      return { refunded: false, refundId: null };
    }
    if (!sub.stripeCustomerId) return { refunded: false, refundId: null };

    const { refundId } = await this.stripeService.cancelAndRefundSubscription(
      sub.stripeSubscriptionId,
      sub.stripeCustomerId,
    );
    sub.status = MerchantSubscriptionStatus.CANCELED;
    sub.cancelReason = 'application_rejected';
    await this.merchantSubscriptionRepo.save(sub);

    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.STRIPE,
      severity: SlackSeverity.INFO,
      type: SlackEventType.SUBSCRIPTION_CANCEL,
      trigger: `Sign-up payment refunded (application rejected): ${businessId}`,
      body: `A merchant paid at sign-up and was then rejected; their subscription was cancelled and the payment refunded.
• Business: ${businessId}
• Refund: ${refundId ?? 'no charge found to refund'}`,
    });
    return { refunded: !!refundId, refundId };
  }

  // Used by unsuspendBusiness — the uniform gate: approved must always
  // imply an active subscription, regardless of why the business was
  // suspended in the first place.
  async hasActiveOrTrialingSubscription(businessId: string): Promise<boolean> {
    const sub = await this.merchantSubscriptionRepo.findOne({ where: { businessId } });
    if (!sub) return false;
    if (sub.status === MerchantSubscriptionStatus.ACTIVE) return true;
    if (sub.status === MerchantSubscriptionStatus.TRIALING) {
      return !sub.trialEndsAt || sub.trialEndsAt > new Date();
    }
    return false;
  }

  // Read-only status for the merchant's own billing/trial-banner UI.
  async getStatusForBusiness(business: Business): Promise<{
    status: MerchantSubscriptionStatus | null;
    kind: MerchantSubscriptionKind | null;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    planTier: string;
    // A card can be attached mid-trial (status stays TRIALING until the
    // trial actually ends) — without this, the frontend can't tell "no
    // card yet" from "already subscribed, still trialing" from status alone.
    hasPaymentMethod: boolean;
  }> {
    const sub = await this.merchantSubscriptionRepo.findOne({
      where: { businessId: business.id },
    });
    return {
      status: sub?.status ?? null,
      kind: sub?.kind ?? null,
      trialEndsAt: sub?.trialEndsAt ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      hasPaymentMethod: !!sub?.stripeSubscriptionId,
      planTier: business.planTier,
    };
  }

  // ---- Merchant-facing: attach a card and start real Stripe billing ----

  async createSetupIntentForBusiness(businessId: string) {
    const sub = await this.merchantSubscriptionRepo.findOne({ where: { businessId } });
    if (!sub?.stripeCustomerId) {
      throw new Error('No Stripe customer on file for this business — approval must run first.');
    }
    return this.stripeService.createSetupIntent(sub.stripeCustomerId);
  }

  // trial_end: pass the existing trialEndsAt if still in the future (so a
  // merchant adding a card mid-trial isn't charged immediately), else
  // 'now' — a win-back path for a merchant re-subscribing post-expiry.
  async attachPaymentMethodAndSubscribe(
    businessId: string,
    paymentMethodId: string,
    stripePriceId: string,
    tier?: BusinessPlanTier,
  ): Promise<MerchantSubscription> {
    const sub = await this.merchantSubscriptionRepo.findOne({ where: { businessId } });
    if (!sub?.stripeCustomerId) {
      throw new Error('No Stripe customer on file for this business — approval must run first.');
    }

    await this.stripeService.attachPaymentMethodAsDefault(sub.stripeCustomerId, paymentMethodId);

    const trialEnd: number | 'now' =
      sub.trialEndsAt && sub.trialEndsAt > new Date()
        ? Math.floor(sub.trialEndsAt.getTime() / 1000)
        : 'now';

    const stripeSubscription = await this.stripeService.createSubscription(
      sub.stripeCustomerId,
      stripePriceId,
      trialEnd,
    );

    sub.stripeSubscriptionId = stripeSubscription.id;
    // They chose a plan: from here on they are a paying merchant, whichever way they started.
    sub.kind = MerchantSubscriptionKind.PAID;
    const saved = await this.merchantSubscriptionRepo.save(sub);
    if (tier) {
      await this.businessRepo.update({ id: businessId }, { planTier: tier });
    }

    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.STRIPE,
      severity: SlackSeverity.INFO,
      type: SlackEventType.SUBSCRIPTION_UPDATE,
      trigger: `Merchant converted trial to paid: ${business?.businessName || businessId}`,
      body: `A merchant added a payment method and started real Stripe billing.
• Business: ${business?.businessName || businessId}
• Subscription: ${stripeSubscription.id}`,
    });

    return saved;
  }

  // ---- Stripe webhook handlers — thin, idempotent, log not throw ----

  async handleSubscriptionDeleted(stripeSubscriptionId: string): Promise<void> {
    const sub = await this.merchantSubscriptionRepo.findOne({
      where: { stripeSubscriptionId },
    });
    if (!sub) return;
    sub.status = MerchantSubscriptionStatus.CANCELED;
    sub.cancelReason = 'stripe_canceled';
    await this.merchantSubscriptionRepo.save(sub);

    // Approved must always imply an active subscription — mirrors the
    // cron sweep's suspendForBilling, kept idempotent alongside it.
    const business = await this.businessRepo.findOne({ where: { id: sub.businessId } });
    if (!business || business.status === BusinessStatus.SUSPENDED) return;

    business.status = BusinessStatus.SUSPENDED;
    await this.businessRepo.save(business);

    try {
      this.emailService.sendMerchantSubscriptionLapsedEmail(
        business.ownerEmail || '',
        business.businessName,
        'stripe_canceled',
      );
    } catch (error) {
      this.logger.error(
        `Failed to send subscription-lapsed email for business ${business.id}: ${error.message}`,
      );
    }

    // Going live posts to Slack (business.service.ts) — going dark from a
    // cancelled subscription previously didn't.
    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.STRIPE,
      severity: SlackSeverity.INFO,
      type: SlackEventType.SUBSCRIPTION_CANCEL,
      trigger: `Merchant subscription cancelled: ${business.businessName}`,
      body: `A merchant's Stripe subscription was cancelled and their storefront has been suspended.
• Business: ${business.businessName}
• Stripe subscription: ${stripeSubscriptionId}`,
    });
  }

  private sendPaymentFailedEmail(business: Business): void {
    if (!business.ownerEmail) return;
    const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
    const subject = 'Your KHS billing payment failed';
    const message = `We couldn't process your latest KHS subscription payment for ${business.businessName}. You have 7 days to update your payment method before your storefront is suspended.`;
    const html = this.templateService.render('communication-bulk', {
      businessName: business.businessName,
      subject,
      clientName: business.ownerName || 'there',
      message,
      closingRemarks: null,
      frontendUrl,
      year: new Date().getFullYear(),
    });
    this.emailService.sendEmail(business.ownerEmail, subject, message, html);
  }

  async handlePaymentFailed(stripeSubscriptionId: string): Promise<void> {
    const sub = await this.merchantSubscriptionRepo.findOne({
      where: { stripeSubscriptionId },
    });
    if (!sub) return;
    // Don't reset the grace-period clock on Stripe's own repeated retries
    // of the same invoice — only set pastDueSince the first time.
    const isFirstFailure = sub.status !== MerchantSubscriptionStatus.PAST_DUE;
    if (isFirstFailure) {
      sub.pastDueSince = new Date();
    }
    sub.status = MerchantSubscriptionStatus.PAST_DUE;
    await this.merchantSubscriptionRepo.save(sub);

    // Previously the merchant only found out 7 days later when the cron
    // suspended them — notify immediately instead.
    if (isFirstFailure) {
      const business = await this.businessRepo.findOne({ where: { id: sub.businessId } });
      if (business) {
        this.sendPaymentFailedEmail(business);
      }
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.ERROR,
        type: SlackEventType.PAYMENT_FAILURE,
        trigger: `Merchant billing payment failed: ${business?.businessName || sub.businessId}`,
        body: `A merchant's KHS subscription payment failed. 7-day grace period started before suspension.
• Business: ${business?.businessName || sub.businessId}
• Stripe subscription: ${stripeSubscriptionId}`,
      });
    }
  }

  async handlePaymentSucceeded(
    stripeSubscriptionId: string,
    currentPeriodEnd: Date,
  ): Promise<void> {
    const sub = await this.merchantSubscriptionRepo.findOne({
      where: { stripeSubscriptionId },
    });
    if (!sub) return;
    sub.status = MerchantSubscriptionStatus.ACTIVE;
    sub.pastDueSince = null;
    sub.currentPeriodEnd = currentPeriodEnd;
    await this.merchantSubscriptionRepo.save(sub);

    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.STRIPE,
      severity: SlackSeverity.INFO,
      type: SlackEventType.PAYMENT_SUCCESS,
      trigger: `Merchant billing payment succeeded (${sub.businessId})`,
      body: `Recurring merchant billing revenue landed.
• Business: ${sub.businessId}
• Stripe subscription: ${stripeSubscriptionId}
• Current period end: ${currentPeriodEnd.toLocaleDateString('en-US')}`,
    });
  }
}
