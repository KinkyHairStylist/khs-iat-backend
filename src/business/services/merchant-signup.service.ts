import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import Stripe from 'stripe';
import { User } from 'src/all_user_entities/user.entity';
import { PlatformSettingsService } from 'src/admin/platform-settings/platform-settings.service';
import { StripeService } from 'src/payment/stripe.service';
import { Business, BusinessPlanTier } from '../entities/business.entity';
import { MerchantSubscription } from '../entities/merchant-subscription.entity';
import { MerchantSubscriptionService } from './merchant-subscription.service';
import { SignupChoiceDto } from '../dtos/requests/SignupChoiceDto';
import {
  PlanTier,
  SignupOption,
  isPlanTier,
  revealStatus,
  tierOrDefault,
} from 'src/helpers/merchant-plans.helper';

// What a validated sign-up choice comes to: the fee tier the new business starts on, and,
// for the paid and MVP options, what to record once the business exists.
export interface ResolvedSignup {
  option: SignupOption;
  planTier: BusinessPlanTier;
  paid?: { customerId: string; subscriptionId: string; currentPeriodEnd: Date | null };
  windowEndsAt?: Date;
}

const SIGNUP_PURPOSE = 'merchant-signup';

// The last step of merchant sign-up. A merchant cannot be created without picking an option,
// and the paid option is only accepted once Stripe confirms the first payment went through,
// so "no payment, no merchant" is enforced here on the server, not just in the page.
@Injectable()
export class MerchantSignupService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly merchantSubscriptions: MerchantSubscriptionService,
    @InjectRepository(MerchantSubscription)
    private readonly subscriptionRepo: Repository<MerchantSubscription>,
  ) {}

  /** Step 1 of paying: a Stripe customer for this user and a SetupIntent to save their card. */
  async createSetupIntent(user: User): Promise<{ clientSecret: string; customerId: string }> {
    const customer = await this.stripeService.createCustomerForUser({
      userId: user.id,
      email: user.email,
      name: `${user.firstName ?? ''} ${user.surname ?? ''}`.trim() || undefined,
    });
    const setupIntent = await this.stripeService.createSetupIntent(customer.id);
    return { clientSecret: setupIntent.client_secret as string, customerId: customer.id };
  }

  /**
   * Step 2: charge the first month. Repeating the call (a double click, a retry after a
   * network error) returns the subscription that already exists instead of charging twice.
   */
  async subscribe(
    user: User,
    input: { tier: PlanTier; paymentMethodId: string; customerId: string },
  ): Promise<{ subscriptionId: string; customerId: string }> {
    if (!isPlanTier(input.tier)) throw new BadRequestException('Choose a plan.');

    const payments = await this.platformSettings.getPayments();
    const priceId = payments.subscriptionPrices?.[input.tier]?.priceId;
    if (!priceId) {
      throw new BadRequestException(`The ${input.tier} plan isn't available to buy yet.`);
    }

    await this.assertCustomerIsTheirs(user, input.customerId);

    const existing = (await this.stripeService.listCustomerSubscriptions(input.customerId)).find(
      (s) =>
        s.metadata?.purpose === SIGNUP_PURPOSE &&
        s.metadata?.tier === input.tier &&
        ['active', 'trialing'].includes(s.status),
    );
    if (existing) return { subscriptionId: existing.id, customerId: input.customerId };

    await this.stripeService.attachPaymentMethodAsDefault(input.customerId, input.paymentMethodId);
    const subscription = await this.stripeService.createSubscriptionNow(input.customerId, priceId, {
      userId: user.id,
      tier: input.tier,
      purpose: SIGNUP_PURPOSE,
    });
    return { subscriptionId: subscription.id, customerId: input.customerId };
  }

  /**
   * Check the chosen option is valid BEFORE the business is created, so a bad or missing
   * payment stops sign-up right here.
   */
  async resolveSignup(user: User, choice: SignupChoiceDto | undefined): Promise<ResolvedSignup> {
    if (!choice?.option) {
      throw new BadRequestException(
        'Choose a plan to start: Trial, MVP or a paid plan.',
      );
    }
    const payments = await this.platformSettings.getPayments();

    if (choice.option === 'trial') {
      return { option: 'trial', planTier: this.asBusinessTier(tierOrDefault(payments.trialFeeTier)) };
    }

    if (choice.option === 'reveal') {
      const window = revealStatus(payments.revealPeriod);
      if (!window.open || !window.endsAt) {
        throw new BadRequestException('MVP is closed.');
      }
      return {
        option: 'reveal',
        planTier: this.asBusinessTier(tierOrDefault(payments.revealFeeTier)),
        windowEndsAt: window.endsAt,
      };
    }

    if (choice.option === 'paid') {
      if (!choice.tier || !isPlanTier(choice.tier) || !choice.stripeSubscriptionId) {
        throw new BadRequestException('Payment is required to become a merchant on a paid plan.');
      }
      const subscription = await this.stripeService.retrieveSubscription(choice.stripeSubscriptionId);

      const paid =
        subscription.metadata?.purpose === SIGNUP_PURPOSE &&
        subscription.metadata?.userId === user.id &&
        subscription.metadata?.tier === choice.tier &&
        ['active', 'trialing'].includes(subscription.status);
      if (!paid) {
        throw new BadRequestException(
          'We could not confirm your payment. Please try again, or contact support if you were charged.',
        );
      }

      const alreadyUsed = await this.subscriptionRepo.exists({
        where: { stripeSubscriptionId: subscription.id },
      });
      if (alreadyUsed) {
        throw new BadRequestException('That payment has already been used for a business.');
      }

      return {
        option: 'paid',
        planTier: this.asBusinessTier(choice.tier),
        paid: {
          customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
          subscriptionId: subscription.id,
          currentPeriodEnd: this.periodEnd(subscription),
        },
      };
    }

    throw new BadRequestException('Unknown sign-up option.');
  }

  /**
   * After the business is saved: record the payment or MVP. A merchant who chose
   * the Trial has nothing to record here; the trial starts when an admin approves them.
   */
  async recordSignup(
    business: Business,
    resolved: ResolvedSignup,
    manager?: EntityManager,
  ): Promise<void> {
    if (resolved.option === 'paid' && resolved.paid) {
      await this.merchantSubscriptions.recordPaidSignup(business, resolved.paid, manager);
    } else if (resolved.option === 'reveal' && resolved.windowEndsAt) {
      await this.merchantSubscriptions.recordRevealSignup(business, resolved.windowEndsAt, manager);
    }
  }

  private async assertCustomerIsTheirs(user: User, customerId: string): Promise<void> {
    const customer = await this.stripeService.retrieveCustomer(customerId);
    if ((customer as Stripe.DeletedCustomer).deleted) {
      throw new ForbiddenException('That payment session is no longer valid.');
    }
    if ((customer as Stripe.Customer).metadata?.userId !== user.id) {
      throw new ForbiddenException('That payment session belongs to a different account.');
    }
  }

  // In recent Stripe API versions the billing period lives on the subscription item.
  private periodEnd(subscription: Stripe.Subscription): Date | null {
    const seconds =
      (subscription as any).current_period_end ??
      subscription.items?.data?.[0]?.current_period_end ??
      null;
    return seconds ? new Date(seconds * 1000) : null;
  }

  private asBusinessTier(tier: PlanTier): BusinessPlanTier {
    return tier as unknown as BusinessPlanTier;
  }
}
