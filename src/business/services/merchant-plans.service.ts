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
  PLAN_TIERS,
  PlanTier,
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
// of the free trial and the free window with its shared end date.
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
      if (!isPlanTier(input.trialFeeTier)) throw new BadRequestException('Unknown trial fee plan.');
      patch.trialFeeTier = input.trialFeeTier;
    }
    if (input.revealFeeTier !== undefined) {
      if (!isPlanTier(input.revealFeeTier)) throw new BadRequestException('Unknown free-window fee plan.');
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
   * An admin moves one merchant to another plan. This sets the fee tier the business pays. If
   * the merchant is already paying by card, their Stripe subscription is switched to the new
   * plan's price too (the difference is prorated onto their next invoice). A merchant on the
   * trial or the free window isn't billed yet, so only the fee tier changes.
   */
  async changeBusinessPlan(
    businessId: string,
    tier: string,
  ): Promise<{ businessId: string; planTier: PlanTier; billingChanged: boolean }> {
    if (!isPlanTier(tier)) throw new BadRequestException('Unknown plan.');

    const business = await this.businessRepo.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (![BusinessStatus.APPROVED, BusinessStatus.SUSPENDED].includes(business.status)) {
      throw new BadRequestException('Only approved businesses can change plan.');
    }
    if ((business.planTier as unknown as PlanTier) === tier) {
      return { businessId, planTier: tier, billingChanged: false };
    }

    const subscription = await this.merchantSubscriptions.getForBusiness(businessId);
    let billingChanged = false;
    if (
      subscription?.kind === MerchantSubscriptionKind.PAID &&
      subscription.stripeSubscriptionId &&
      subscription.status !== MerchantSubscriptionStatus.CANCELED
    ) {
      const payments = await this.platformSettings.getPayments();
      const priceId = payments.subscriptionPrices?.[tier]?.priceId;
      if (!priceId) {
        throw new BadRequestException(`The ${tier} plan has no Stripe price yet. Set its price first.`);
      }
      await this.stripeService.changeSubscriptionPrice(subscription.stripeSubscriptionId, priceId);
      billingChanged = true;
    }

    const previous = business.planTier;
    await this.businessRepo.update({ id: businessId }, { planTier: tier as unknown as BusinessPlanTier });

    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Merchant plan changed: ${business.businessName}`,
      body: `An admin changed a merchant's plan.
• Business: ${business.businessName} (${businessId})
• ${previous} → ${tier}
• Stripe subscription ${billingChanged ? 'switched to the new price' : 'unchanged (not paying by card yet)'}`,
    });

    return { businessId, planTier: tier, billingChanged };
  }

  /** Open the free window for `days` days from now. */
  async startReveal(days: number) {
    const payments = await this.platformSettings.getPayments();
    if (revealStatus(payments.revealPeriod).open) {
      throw new BadRequestException(
        'The free window is already open. Add days to it instead of starting a new one.',
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
    this.logger.log(`Free window extended by ${days} days; ${moved} merchant(s) moved to ${window.endsAt}`);
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
