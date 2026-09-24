import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MerchantSignupService } from './merchant-signup.service';

const user = { id: 'user-1', email: 'a@b.test', firstName: 'Ada', surname: 'Obi' } as any;
const DAY = 24 * 60 * 60 * 1000;

const payments = (over: Record<string, any> = {}) => ({
  subscriptionPrices: {
    Starter: { priceId: 'price_starter', displayAmount: 29.99 },
    Growth: { priceId: 'price_growth', displayAmount: 59.99 },
    Pro: { priceId: '', displayAmount: 99.99 },
  },
  trialFeeTier: 'Starter',
  revealFeeTier: 'Growth',
  revealPeriod: { enabled: false, startsAt: null, endsAt: null },
  ...over,
});

const stripeSub = (over: Record<string, any> = {}) => ({
  id: 'sub_1',
  status: 'active',
  customer: 'cus_1',
  metadata: { purpose: 'merchant-signup', userId: 'user-1', tier: 'Growth' },
  items: { data: [{ current_period_end: 1_800_000_000 }] },
  ...over,
});

describe('MerchantSignupService', () => {
  let stripe: Record<string, jest.Mock>;
  let settings: { getPayments: jest.Mock; updatePlanSettings: jest.Mock };
  let subs: Record<string, jest.Mock>;
  let subRepo: { exists: jest.Mock };
  let service: MerchantSignupService;

  beforeEach(() => {
    stripe = {
      createCustomerForUser: jest.fn().mockResolvedValue({ id: 'cus_1' }),
      createSetupIntent: jest.fn().mockResolvedValue({ client_secret: 'seti_secret' }),
      retrieveCustomer: jest.fn().mockResolvedValue({ id: 'cus_1', metadata: { userId: 'user-1' } }),
      listCustomerSubscriptions: jest.fn().mockResolvedValue([]),
      attachPaymentMethodAsDefault: jest.fn().mockResolvedValue(undefined),
      createSubscriptionNow: jest.fn().mockResolvedValue({ id: 'sub_new' }),
      retrieveSubscription: jest.fn().mockResolvedValue(stripeSub()),
      priceExists: jest.fn().mockResolvedValue(true),
      createTierPrice: jest.fn().mockResolvedValue({ id: 'price_fresh' }),
    };
    settings = { getPayments: jest.fn().mockResolvedValue(payments()), updatePlanSettings: jest.fn() };
    subs = { recordPaidSignup: jest.fn(), recordRevealSignup: jest.fn() };
    subRepo = { exists: jest.fn().mockResolvedValue(false) };
    service = new MerchantSignupService(stripe as any, settings as any, subs as any, subRepo as any);
  });

  describe('createSetupIntent', () => {
    it('makes a Stripe customer for this user and a SetupIntent to save their card', async () => {
      const result = await service.createSetupIntent(user);
      expect(stripe.createCustomerForUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', email: 'a@b.test', name: 'Ada Obi' }),
      );
      expect(result).toEqual({ clientSecret: 'seti_secret', customerId: 'cus_1' });
    });
  });

  describe('subscribe', () => {
    const input = { tier: 'Growth' as const, paymentMethodId: 'pm_1', customerId: 'cus_1' };

    it('charges the first month of the chosen plan and tags the subscription with the user', async () => {
      const result = await service.subscribe(user, input);
      expect(stripe.attachPaymentMethodAsDefault).toHaveBeenCalledWith('cus_1', 'pm_1');
      expect(stripe.createSubscriptionNow).toHaveBeenCalledWith('cus_1', 'price_growth', {
        userId: 'user-1',
        tier: 'Growth',
        purpose: 'merchant-signup',
      });
      expect(result).toEqual({ subscriptionId: 'sub_new', customerId: 'cus_1' });
    });

    it('refuses a plan that has no Stripe price yet', async () => {
      await expect(service.subscribe(user, { ...input, tier: 'Pro' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stripe.createSubscriptionNow).not.toHaveBeenCalled();
    });

    it("refuses a payment session that belongs to someone else's account", async () => {
      stripe.retrieveCustomer.mockResolvedValue({ id: 'cus_1', metadata: { userId: 'someone-else' } });
      await expect(service.subscribe(user, input)).rejects.toBeInstanceOf(ForbiddenException);
      expect(stripe.createSubscriptionNow).not.toHaveBeenCalled();
    });

    it('does not charge twice when the same sign-up is repeated', async () => {
      stripe.listCustomerSubscriptions.mockResolvedValue([stripeSub({ id: 'sub_existing' })]);
      const result = await service.subscribe(user, input);
      expect(result.subscriptionId).toBe('sub_existing');
      expect(stripe.createSubscriptionNow).not.toHaveBeenCalled();
    });

    it('does not reuse a cancelled subscription', async () => {
      stripe.listCustomerSubscriptions.mockResolvedValue([stripeSub({ id: 'sub_old', status: 'canceled' })]);
      await service.subscribe(user, input);
      expect(stripe.createSubscriptionNow).toHaveBeenCalled();
    });

    it('surfaces a declined card and never leaves a subscription behind', async () => {
      stripe.createSubscriptionNow.mockRejectedValue(new BadRequestException('Your card could not be charged: declined'));
      await expect(service.subscribe(user, input)).rejects.toThrow(/could not be charged/);
    });

    it('self-heals a stored price id that belongs to a different Stripe environment', async () => {
      // Same real bug createTierPrice already fixed for the admin pricing screen,
      // reached here instead: nobody touched pricing, but the stored price id
      // still doesn't exist under this environment's Stripe account.
      stripe.priceExists.mockResolvedValue(false);
      const result = await service.subscribe(user, input);

      expect(stripe.priceExists).toHaveBeenCalledWith('price_growth');
      expect(stripe.createTierPrice).toHaveBeenCalledWith({ tier: 'Growth', amountCents: 5999 });
      expect(stripe.createSubscriptionNow).toHaveBeenCalledWith('cus_1', 'price_fresh', expect.anything());
      expect(result.subscriptionId).toBe('sub_new');
    });

    it('persists the freshly-minted price id so the next sign-up skips the retrieve failure', async () => {
      stripe.priceExists.mockResolvedValue(false);
      await service.subscribe(user, input);

      expect(settings.updatePlanSettings).toHaveBeenCalledWith({
        subscriptionPrices: expect.objectContaining({
          Growth: { priceId: 'price_fresh', displayAmount: 59.99 },
          Starter: { priceId: 'price_starter', displayAmount: 29.99 },
        }),
      });
    });

    it('never mints a new Stripe price when the stored one is already usable', async () => {
      await service.subscribe(user, input);
      expect(stripe.createTierPrice).not.toHaveBeenCalled();
      expect(settings.updatePlanSettings).not.toHaveBeenCalled();
    });
  });

  describe('resolveSignup', () => {
    it('refuses to create a merchant with no choice at all', async () => {
      await expect(service.resolveSignup(user, undefined)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lets a merchant take the Trial, on the configured fee tier', async () => {
      await expect(service.resolveSignup(user, { option: 'trial' })).resolves.toEqual({
        option: 'trial',
        planTier: 'Starter',
      });
    });

    describe('paid', () => {
      it('accepts a payment Stripe confirms for this user and plan', async () => {
        const result = await service.resolveSignup(user, {
          option: 'paid',
          tier: 'Growth',
          stripeSubscriptionId: 'sub_1',
        });
        expect(result).toMatchObject({
          option: 'paid',
          planTier: 'Growth',
          paid: { customerId: 'cus_1', subscriptionId: 'sub_1' },
        });
        expect(result.paid?.currentPeriodEnd).toEqual(new Date(1_800_000_000 * 1000));
      });

      it('refuses with no subscription id: no payment, no merchant', async () => {
        await expect(
          service.resolveSignup(user, { option: 'paid', tier: 'Growth' }),
        ).rejects.toThrow(/Payment is required/);
      });

      it('refuses a subscription that is not active', async () => {
        stripe.retrieveSubscription.mockResolvedValue(stripeSub({ status: 'incomplete' }));
        await expect(
          service.resolveSignup(user, { option: 'paid', tier: 'Growth', stripeSubscriptionId: 'sub_1' }),
        ).rejects.toThrow(/could not confirm your payment/);
      });

      it("refuses another user's subscription", async () => {
        stripe.retrieveSubscription.mockResolvedValue(
          stripeSub({ metadata: { purpose: 'merchant-signup', userId: 'other', tier: 'Growth' } }),
        );
        await expect(
          service.resolveSignup(user, { option: 'paid', tier: 'Growth', stripeSubscriptionId: 'sub_1' }),
        ).rejects.toThrow(/could not confirm your payment/);
      });

      it('refuses a subscription for a different plan than the one claimed', async () => {
        await expect(
          service.resolveSignup(user, { option: 'paid', tier: 'Pro', stripeSubscriptionId: 'sub_1' }),
        ).rejects.toThrow(/could not confirm your payment/);
      });

      it('refuses a subscription that is not from the sign-up step', async () => {
        stripe.retrieveSubscription.mockResolvedValue(stripeSub({ metadata: { userId: 'user-1', tier: 'Growth' } }));
        await expect(
          service.resolveSignup(user, { option: 'paid', tier: 'Growth', stripeSubscriptionId: 'sub_1' }),
        ).rejects.toThrow(/could not confirm your payment/);
      });

      it('refuses a payment that already created a business', async () => {
        subRepo.exists.mockResolvedValue(true);
        await expect(
          service.resolveSignup(user, { option: 'paid', tier: 'Growth', stripeSubscriptionId: 'sub_1' }),
        ).rejects.toThrow(/already been used/);
      });
    });

    describe('MVP', () => {
      const open = () =>
        settings.getPayments.mockResolvedValue(
          payments({
            revealPeriod: {
              enabled: true,
              startsAt: new Date(Date.now() - DAY).toISOString(),
              endsAt: new Date(Date.now() + 50 * DAY).toISOString(),
            },
          }),
        );

      it('is refused while the window is closed', async () => {
        await expect(service.resolveSignup(user, { option: 'reveal' })).rejects.toThrow(/closed/);
      });

      it('is refused once the window has ended', async () => {
        settings.getPayments.mockResolvedValue(
          payments({
            revealPeriod: { enabled: true, startsAt: null, endsAt: new Date(Date.now() - DAY).toISOString() },
          }),
        );
        await expect(service.resolveSignup(user, { option: 'reveal' })).rejects.toThrow(/closed/);
      });

      it("joins to the window's shared end date, on the configured fee tier", async () => {
        open();
        const result = await service.resolveSignup(user, { option: 'reveal' });
        expect(result.option).toBe('reveal');
        expect(result.planTier).toBe('Growth');
        expect(result.windowEndsAt!.getTime()).toBeGreaterThan(Date.now() + 49 * DAY);
      });
    });
  });

  describe('recordSignup', () => {
    it('records a paid signup', async () => {
      const paid = { customerId: 'cus_1', subscriptionId: 'sub_1', currentPeriodEnd: null };
      await service.recordSignup({ id: 'biz' } as any, { option: 'paid', planTier: 'Growth' as any, paid });
      expect(subs.recordPaidSignup).toHaveBeenCalledWith({ id: 'biz' }, paid, undefined);
    });

    it('records an MVP signup against the shared end date', async () => {
      const end = new Date();
      await service.recordSignup({ id: 'biz' } as any, { option: 'reveal', planTier: 'Starter' as any, windowEndsAt: end });
      expect(subs.recordRevealSignup).toHaveBeenCalledWith({ id: 'biz' }, end, undefined);
    });

    it('records nothing for the trial: it starts when an admin approves', async () => {
      await service.recordSignup({ id: 'biz' } as any, { option: 'trial', planTier: 'Starter' as any });
      expect(subs.recordPaidSignup).not.toHaveBeenCalled();
      expect(subs.recordRevealSignup).not.toHaveBeenCalled();
    });
  });
});
