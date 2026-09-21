import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, BusinessPlanTier, BusinessStatus } from '../entities/business.entity';
import { MerchantSubscriptionKind, MerchantSubscriptionStatus } from '../entities/merchant-subscription.entity';
import { SlackService } from 'src/services/slack.service';
import { SlackEventType, SlackNode, SlackProvider, SlackSeverity } from 'src/utils/enum';
import { PlatformSettingsService } from 'src/admin/platform-settings/platform-settings.service';
import { StripeService } from 'src/payment/stripe.service';
import { MerchantSubscriptionService } from './merchant-subscription.service';
import {
  MerchantPlanName,
  PLAN_TIERS,
  PlanTier,
  isMerchantPlanName,
  planNameFor,
  extendRevealWindow,
  isPlanTier,
  revealStatus,
  startRevealWindow,
  tierOrDefault,
} from 'src/helpers/merchant-plans.helper';

export interface UpdatePlanSettingsInput {
  tiers?: Partial<Record<PlanTier, { price?: number; acquisitionFeeRate?: number }>>;
  commissionRate?: number;
  trialDays?: number;
  trialFeeTier?: PlanTier;
  revealFeeTier?: PlanTier;
}

// What merchants are offered and what it costs, all driven by platform settings so an
// admin can change it without a deploy: plan prices, the fee each plan pays, the length
// of the Trial and MVP (the window with its shared end date).
@Injectable()
export class MerchantPlansService {
  private readonly logger = new Logger(MerchantPlansService.name);

  constructor(
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly platformSettings: PlatformSettingsService,
    private readonly merchantSubscriptions: MerchantSubscriptionService,
    private readonly stripeService: StripeService,
  ) {}

  /** What the sign-up step and the billing page show. Safe to expose publicly. */
  async getPublicPlans(now: Date = new Date()) {
    const payments = await this.platformSettings.getPayments();
    const reveal = revealStatus(payments.revealPeriod, now);
    const trialFeeTier = tierOrDefault(payments.trialFeeTier);
    const revealFeeTier = tierOrDefault(payments.revealFeeTier);
    const feeRate = (tier: PlanTier) => Number(payments.acquisitionFeeTiers?.[tier]) || 0;

    const tiers = {} as Record<
      PlanTier,
      { displayAmount: number; acquisitionFeeRate: number; available: boolean }
    >;
    for (const tier of PLAN_TIERS) {
      const price = payments.subscriptionPrices?.[tier];
      tiers[tier] = {
        displayAmount: Number(price?.displayAmount) || 0,
        acquisitionFeeRate: feeRate(tier),
        // A plan can only be bought once it has a Stripe price behind it.
        available: !!price?.priceId,
      };
    }

    return {
      tiers,
      commissionRate: Number(payments.commissionRate) || 0,
      trial: {
        days: payments.trialDays ?? 14,
        feeTier: trialFeeTier,
        acquisitionFeeRate: feeRate(trialFeeTier),
      },
      reveal: {
        available: reveal.open,
        endsAt: reveal.endsAt,
        daysLeft: reveal.daysLeft,
        feeTier: revealFeeTier,
        acquisitionFeeRate: feeRate(revealFeeTier),
      },
    };
  }

  /** Everything an admin can change, plus how many merchants are on each option. */
  async getAdminPlans(now: Date = new Date()) {
    const payments = await this.platformSettings.getPayments();
    const reveal = revealStatus(payments.revealPeriod, now);

    const tiers = {} as Record<
      PlanTier,
      { price: number; acquisitionFeeRate: number; stripePriceConfigured: boolean }
    >;
    for (const tier of PLAN_TIERS) {
      const price = payments.subscriptionPrices?.[tier];
      tiers[tier] = {
        price: Number(price?.displayAmount) || 0,
        acquisitionFeeRate: Number(payments.acquisitionFeeTiers?.[tier]) || 0,
        stripePriceConfigured: !!price?.priceId,
      };
    }

    return {
      tiers,
      commissionRate: Number(payments.commissionRate) || 0,
      trialDays: payments.trialDays ?? 14,
      trialFeeTier: tierOrDefault(payments.trialFeeTier),
      revealFeeTier: tierOrDefault(payments.revealFeeTier),
      reveal: {
        enabled: reveal.enabled,
        open: reveal.open,
        startsAt: reveal.startsAt,
        endsAt: reveal.endsAt,
        daysLeft: reveal.daysLeft,
      },
      merchantCounts: await this.merchantSubscriptions.countByKind(),
    };
  }

  /**
   * Save plan settings. Changing a plan's price creates a new Stripe price for it; merchants
   * already subscribed stay on the price they signed up at, and new sign-ups get the new one.
   */
  async updatePlanSettings(input: UpdatePlanSettingsInput) {
    const payments = await this.platformSettings.getPayments();
    const patch: Record<string, any> = {};

    if (input.commissionRate !== undefined) {
      patch.commissionRate = this.percent(input.commissionRate, 'Commission rate');
    }
    if (input.trialDays !== undefined) {
      if (!Number.isInteger(input.trialDays) || input.trialDays < 1 || input.trialDays > 90) {
        throw new BadRequestException('Trial length must be a whole number of days from 1 to 90.');
      }
      patch.trialDays = input.trialDays;
    }
    if (input.trialFeeTier !== undefined) {
      if (!isPlanTier(input.trialFeeTier)) throw new BadRequestException('Unknown Trial fee plan.');
      patch.trialFeeTier = input.trialFeeTier;
    }
    if (input.revealFeeTier !== undefined) {
      if (!isPlanTier(input.revealFeeTier)) throw new BadRequestException('Unknown MVP fee plan.');
      patch.revealFeeTier = input.revealFeeTier;
    }

    if (input.tiers) {
      const acquisitionFeeTiers = { ...payments.acquisitionFeeTiers };
      const subscriptionPrices = {
        Starter: { ...payments.subscriptionPrices.Starter },
        Growth: { ...payments.subscriptionPrices.Growth },
        Pro: { ...payments.subscriptionPrices.Pro },
      };

      for (const [name, change] of Object.entries(input.tiers)) {
        if (!isPlanTier(name)) throw new BadRequestException(`Unknown plan "${name}".`);
        if (!change) continue;

        if (change.acquisitionFeeRate !== undefined) {
          acquisitionFeeTiers[name] = this.percent(change.acquisitionFeeRate, `${name} fee`);
        }

        if (change.price !== undefined) {
          const price = Number(change.price);
          if (!Number.isFinite(price) || price < 0.5 || price > 10000) {
            throw new BadRequestException(`${name} price must be between 0.50 and 10,000.`);
          }
          const current = subscriptionPrices[name];
          const cents = Math.round(price * 100);
          const changed = Math.round((Number(current.displayAmount) || 0) * 100) !== cents;
          if (changed || !current.priceId) {
            const created = await this.stripeService.createTierPrice({
              tier: name,
              amountCents: cents,
              existingPriceId: current.priceId || undefined,
            });
            subscriptionPrices[name] = { priceId: created.id, displayAmount: cents / 100 };
            this.logger.log(`Created Stripe price ${created.id} for ${name} at ${cents / 100}`);
          }
        }
      }

      patch.acquisitionFeeTiers = acquisitionFeeTiers;
      patch.subscriptionPrices = subscriptionPrices;
    }

    if (Object.keys(patch).length > 0) {
      await this.platformSettings.updatePlanSettings(patch);
    }
    return this.getAdminPlans();
  }

  /**
   * An admin moves one merchant to another of the five plans.
   * - Starter / Growth / Pro: a merchant paying by card has their Stripe subscription switched (the
   *   difference is prorated onto their next invoice). One on Trial or MVP hasn't paid, so an admin
   *   can't put them on a paid plan; they choose and pay for it themselves on the billing page.
   * - Trial: a fresh set of trial days from today.
   * - MVP: until the shared end date, and only while MVP is open.
   * A merchant paying by card can't be moved onto Trial or MVP; that would leave them billed.
   */
  async changeBusinessPlan(
    businessId: string,
    plan: string,
  ): Promise<{
    businessId: string;
    plan: MerchantPlanName;
    planTier: PlanTier;
    billingChanged: boolean;
  }> {
    if (!isMerchantPlanName(plan)) throw new BadRequestException('Unknown plan.');

    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (![BusinessStatus.APPROVED, BusinessStatus.SUSPENDED].includes(business.status)) {
      throw new BadRequestException('Only approved businesses can change plan.');
    }

    const subscription = await this.merchantSubscriptions.getForBusiness(businessId);
    const paysByCard =
      subscription?.kind === MerchantSubscriptionKind.PAID &&
      !!subscription.stripeSubscriptionId &&
      subscription.status !== MerchantSubscriptionStatus.CANCELED;
    const currentTier = business.planTier as unknown as PlanTier;
    const currentPlan = planNameFor(subscription?.kind, currentTier);
    if (currentPlan === plan) {
      return { businessId, plan, planTier: currentTier, billingChanged: false };
    }

    const payments = await this.platformSettings.getPayments();
    let newTier: PlanTier;
    let billingChanged = false;

    if (plan === 'Trial' || plan === 'MVP') {
      if (paysByCard) {
        throw new BadRequestException(
          `This merchant pays by card. Cancel their subscription in Stripe before moving them to ${plan}.`,
        );
      }
      if (plan === 'Trial') {
        const days = payments.trialDays ?? 14;
        await this.merchantSubscriptions.assignFreePlan(
          business,
          MerchantSubscriptionKind.TRIAL,
          new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        );
        newTier = tierOrDefault(payments.trialFeeTier);
      } else {
        const window = revealStatus(payments.revealPeriod);
        if (!window.open || !window.endsAt) {
          throw new BadRequestException('MVP is closed. Open it in the plan settings first.');
        }
        await this.merchantSubscriptions.assignFreePlan(
          business,
          MerchantSubscriptionKind.REVEAL,
          window.endsAt,
        );
        newTier = tierOrDefault(payments.revealFeeTier);
      }
    } else {
      newTier = plan;
      if (
        subscription?.kind === MerchantSubscriptionKind.TRIAL ||
        subscription?.kind === MerchantSubscriptionKind.REVEAL
      ) {
        throw new BadRequestException(
          `This merchant is on ${currentPlan} and hasn't paid. They choose and pay for ${plan} on their billing page.`,
        );
      }
      if (paysByCard) {
        const priceId = payments.subscriptionPrices?.[plan]?.priceId;
        if (!priceId) {
          throw new BadRequestException(`The ${plan} plan has no Stripe price yet. Set its price first.`);
        }
        await this.stripeService.changeSubscriptionPrice(
          (subscription as { stripeSubscriptionId: string }).stripeSubscriptionId,
          priceId,
        );
        billingChanged = true;
      }
    }

    await this.businessRepo.update({ id: businessId }, { planTier: newTier as unknown as BusinessPlanTier });

    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Merchant plan changed: ${business.businessName}`,
      body: `An admin changed a merchant's plan.
• Business: ${business.businessName} (${businessId})
• ${currentPlan} → ${plan} (fees: ${newTier})
• Stripe subscription ${billingChanged ? 'switched to the new price' : 'unchanged'}`,
    });

    return { businessId, plan, planTier: newTier, billingChanged };
  }

  /** Open MVP for `days` days from now. */
  async startReveal(days: number) {
    const payments = await this.platformSettings.getPayments();
    if (revealStatus(payments.revealPeriod).open) {
      throw new BadRequestException(
        'MVP is already open. Add days to it instead of starting a new one.',
      );
    }
    let window;
    try {
      window = startRevealWindow(days);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
    await this.platformSettings.updatePlanSettings({ revealPeriod: window });
    return this.getAdminPlans();
  }

  /**
   * Add days to the window. The end date moves later for everyone: new sign-ups see more days
   * left, and merchants already in the window keep access to the new end date.
   */
  async extendReveal(days: number) {
    const payments = await this.platformSettings.getPayments();
    let window;
    try {
      window = extendRevealWindow(payments.revealPeriod, days);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
    await this.platformSettings.updatePlanSettings({ revealPeriod: window });
    const moved = await this.merchantSubscriptions.moveRevealEnd(new Date(window.endsAt as string));
    this.logger.log(`MVP extended by ${days} days; ${moved} merchant(s) moved to ${window.endsAt}`);
    return this.getAdminPlans();
  }

  /** Stop taking new merchants into the window. Merchants already in it keep their end date. */
  async stopReveal() {
    const payments = await this.platformSettings.getPayments();
    await this.platformSettings.updatePlanSettings({
      revealPeriod: { ...payments.revealPeriod, enabled: false },
    });
    return this.getAdminPlans();
  }

  private percent(value: unknown, label: string): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new BadRequestException(`${label} must be between 0 and 100.`);
    }
    return n;
  }
}
