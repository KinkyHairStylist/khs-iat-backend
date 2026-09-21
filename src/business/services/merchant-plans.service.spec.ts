import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessStatus } from '../entities/business.entity';
import { MerchantSubscriptionKind, MerchantSubscriptionStatus } from '../entities/merchant-subscription.entity';
import { MerchantPlansService } from './merchant-plans.service';

jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));

const DAY = 24 * 60 * 60 * 1000;

const basePayments = () => ({
  acquisitionFeeTiers: { Starter: 10, Growth: 5, Pro: 0 },
  commissionRate: 12,
  subscriptionPrices: {
    Starter: { priceId: 'price_starter', displayAmount: 29.99 },
    Growth: { priceId: 'price_growth', displayAmount: 59.99 },
    Pro: { priceId: 'price_pro', displayAmount: 99.99 },
  },
  trialDays: 14,
  trialFeeTier: 'Starter',
  revealFeeTier: 'Starter',
  revealPeriod: { enabled: false, startsAt: null, endsAt: null } as any,
});

describe('MerchantPlansService', () => {
  let current: ReturnType<typeof basePayments>;
  let settings: { getPayments: jest.Mock; updatePlanSettings: jest.Mock };
  let subs: { countByKind: jest.Mock; moveRevealEnd: jest.Mock; getForBusiness: jest.Mock };
  let stripe: { createTierPrice: jest.Mock; changeSubscriptionPrice: jest.Mock };
  let businessRepo: { findOne: jest.Mock; update: jest.Mock };
  let service: MerchantPlansService;

  beforeEach(() => {
    current = basePayments();
    settings = {
      getPayments: jest.fn(async () => current),
      updatePlanSettings: jest.fn(async (patch) => {
        current = { ...current, ...patch };
      }),
    };
    subs = {
      countByKind: jest.fn().mockResolvedValue({ trial: 3, reveal: 2, paid: 5 }),
      moveRevealEnd: jest.fn().mockResolvedValue(2),
      getForBusiness: jest.fn().mockResolvedValue(null),
    };
    stripe = {
      createTierPrice: jest.fn().mockResolvedValue({ id: 'price_new' }),
      changeSubscriptionPrice: jest.fn().mockResolvedValue({}),
    };
    businessRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'biz-1',
        businessName: 'Da Liv',
        status: BusinessStatus.APPROVED,
        planTier: 'Starter',
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    service = new MerchantPlansService(businessRepo as any, settings as any, subs as any, stripe as any);
  });

  describe('getPublicPlans', () => {
    it('lists the plans, the trial and a closed MVP by default', async () => {
      const plans = await service.getPublicPlans();
      expect(plans.tiers.Growth).toEqual({ displayAmount: 59.99, acquisitionFeeRate: 5, available: true });
      expect(plans.trial).toEqual({ days: 14, feeTier: 'Starter', acquisitionFeeRate: 10 });
      expect(plans.reveal.available).toBe(false);
    });

    it('counts MVP down from the server clock, so a later joiner sees fewer days', async () => {
      const ends = new Date('2026-12-01T00:00:00.000Z');
      current.revealPeriod = { enabled: true, startsAt: null, endsAt: ends.toISOString() };
      const day1 = await service.getPublicPlans(new Date(ends.getTime() - 60 * DAY));
      const day11 = await service.getPublicPlans(new Date(ends.getTime() - 50 * DAY));
      expect(day1.reveal).toMatchObject({ available: true, daysLeft: 60 });
      expect(day11.reveal).toMatchObject({ available: true, daysLeft: 50 });
    });

    it('marks a plan unavailable until it has a Stripe price', async () => {
      current.subscriptionPrices.Pro.priceId = '';
      expect((await service.getPublicPlans()).tiers.Pro.available).toBe(false);
    });
  });

  describe('updatePlanSettings', () => {
    it('saves commission, trial length and fee tiers', async () => {
      await service.updatePlanSettings({
        commissionRate: 15,
        trialDays: 21,
        trialFeeTier: 'Growth',
        revealFeeTier: 'Pro',
      });
      expect(settings.updatePlanSettings).toHaveBeenCalledWith({
        commissionRate: 15,
        trialDays: 21,
        trialFeeTier: 'Growth',
        revealFeeTier: 'Pro',
      });
    });

    it('creates a new Stripe price when a plan price changes, keeping the old one for existing merchants', async () => {
      await service.updatePlanSettings({ tiers: { Growth: { price: 69.99 } } });
      expect(stripe.createTierPrice).toHaveBeenCalledWith({
        tier: 'Growth',
        amountCents: 6999,
        existingPriceId: 'price_growth',
      });
      const patch = settings.updatePlanSettings.mock.calls[0][0];
      expect(patch.subscriptionPrices.Growth).toEqual({ priceId: 'price_new', displayAmount: 69.99 });
      expect(patch.subscriptionPrices.Starter.priceId).toBe('price_starter');
    });

    it('does not touch Stripe when the price is unchanged', async () => {
      await service.updatePlanSettings({ tiers: { Growth: { price: 59.99, acquisitionFeeRate: 4 } } });
      expect(stripe.createTierPrice).not.toHaveBeenCalled();
      expect(settings.updatePlanSettings.mock.calls[0][0].acquisitionFeeTiers.Growth).toBe(4);
    });

    it('creates the Stripe price for a plan that never had one', async () => {
      current.subscriptionPrices.Pro.priceId = '';
      await service.updatePlanSettings({ tiers: { Pro: { price: 99.99 } } });
      expect(stripe.createTierPrice).toHaveBeenCalledWith(
        expect.objectContaining({ tier: 'Pro', existingPriceId: undefined }),
      );
    });

    it.each([
      [{ commissionRate: 120 }],
      [{ commissionRate: -1 }],
      [{ trialDays: 0 }],
      [{ trialDays: 91 }],
      [{ trialDays: 7.5 }],
      [{ trialFeeTier: 'Gold' as any }],
      [{ tiers: { Starter: { price: 0 } } }],
      [{ tiers: { Starter: { acquisitionFeeRate: 101 } } }],
      [{ tiers: { Platinum: { price: 10 } } as any }],
    ])('rejects invalid input %j', async (input) => {
      await expect(service.updatePlanSettings(input as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(settings.updatePlanSettings).not.toHaveBeenCalled();
      expect(stripe.createTierPrice).not.toHaveBeenCalled();
    });
  });

  describe('MVP', () => {
    it('opens for the given number of days', async () => {
      const result = await service.startReveal(60);
      expect(result.reveal).toMatchObject({ enabled: true, open: true, daysLeft: 60 });
    });

    it('will not start a second window while one is open', async () => {
      await service.startReveal(60);
      await expect(service.startReveal(30)).rejects.toThrow(/already open/);
    });

    it('adding days moves the end date and everyone already inside it', async () => {
      await service.startReveal(60);
      const result = await service.extendReveal(15);
      expect(result.reveal.daysLeft).toBe(75);
      expect(subs.moveRevealEnd).toHaveBeenCalledWith(new Date(current.revealPeriod.endsAt));
    });

    it('rejects adding a non-positive or fractional number of days', async () => {
      await expect(service.extendReveal(0)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.extendReveal(2.5)).rejects.toBeInstanceOf(BadRequestException);
      expect(subs.moveRevealEnd).not.toHaveBeenCalled();
    });

    it('stopping closes it to new merchants and leaves the end date alone', async () => {
      await service.startReveal(60);
      const endsAt = current.revealPeriod.endsAt;
      const result = await service.stopReveal();
      expect(result.reveal).toMatchObject({ enabled: false, open: false });
      expect(current.revealPeriod.endsAt).toBe(endsAt);
      expect(subs.moveRevealEnd).not.toHaveBeenCalled();
    });
  });

  describe('changeBusinessPlan', () => {
    const paidSub = (over: Record<string, any> = {}) => ({
      kind: MerchantSubscriptionKind.PAID,
      status: MerchantSubscriptionStatus.ACTIVE,
      stripeSubscriptionId: 'sub_1',
      ...over,
    });

    it('switches the card subscription to the new price for a merchant who pays by card', async () => {
      subs.getForBusiness.mockResolvedValue(paidSub());
      const result = await service.changeBusinessPlan('biz-1', 'Growth');
      expect(stripe.changeSubscriptionPrice).toHaveBeenCalledWith('sub_1', 'price_growth');
      expect(businessRepo.update).toHaveBeenCalledWith({ id: 'biz-1' }, { planTier: 'Growth' });
      expect(result).toEqual({ businessId: 'biz-1', plan: 'Growth', planTier: 'Growth', billingChanged: true });
    });

    it("won't put a merchant on a paid plan for them when they are on Trial or MVP and haven't paid", async () => {
      for (const kind of [MerchantSubscriptionKind.TRIAL, MerchantSubscriptionKind.REVEAL]) {
        subs.getForBusiness.mockResolvedValue(paidSub({ kind, stripeSubscriptionId: null }));
        await expect(service.changeBusinessPlan('biz-1', 'Pro')).rejects.toThrow(/hasn't paid/);
      }
      expect(stripe.changeSubscriptionPrice).not.toHaveBeenCalled();
      expect(businessRepo.update).not.toHaveBeenCalled();
    });

    describe('to Trial or MVP', () => {
      let assignFreePlan: jest.Mock;
      beforeEach(() => {
        assignFreePlan = jest.fn().mockResolvedValue({});
        (subs as any).assignFreePlan = assignFreePlan;
        businessRepo.findOne.mockResolvedValue({
          id: 'biz-1',
          businessName: 'Da Liv',
          status: BusinessStatus.APPROVED,
          planTier: 'Growth',
        });
      });

      it('starts a fresh Trial from today on the Trial fee tier', async () => {
        const before = Date.now();
        const result = await service.changeBusinessPlan('biz-1', 'Trial');
        const [, kind, endsAt] = assignFreePlan.mock.calls[0];
        expect(kind).toBe(MerchantSubscriptionKind.TRIAL);
        expect(endsAt.getTime()).toBeGreaterThanOrEqual(before + 14 * DAY);
        expect(businessRepo.update).toHaveBeenCalledWith({ id: 'biz-1' }, { planTier: 'Starter' });
        expect(result).toMatchObject({ plan: 'Trial', planTier: 'Starter', billingChanged: false });
      });

      it('puts a merchant on MVP until the shared end date while MVP is open', async () => {
        const endsAt = new Date(Date.now() + 40 * DAY);
        current.revealPeriod = { enabled: true, startsAt: new Date().toISOString(), endsAt: endsAt.toISOString() };
        const result = await service.changeBusinessPlan('biz-1', 'MVP');
        expect(assignFreePlan).toHaveBeenCalledWith(expect.anything(), MerchantSubscriptionKind.REVEAL, endsAt);
        expect(result.plan).toBe('MVP');
      });

      it('refuses MVP while it is closed', async () => {
        await expect(service.changeBusinessPlan('biz-1', 'MVP')).rejects.toThrow(/MVP is closed/);
        expect(assignFreePlan).not.toHaveBeenCalled();
        expect(businessRepo.update).not.toHaveBeenCalled();
      });

      it('refuses to move a card-paying merchant onto Trial or MVP', async () => {
        subs.getForBusiness.mockResolvedValue(paidSub());
        await expect(service.changeBusinessPlan('biz-1', 'Trial')).rejects.toThrow(/pays by card/);
        expect(assignFreePlan).not.toHaveBeenCalled();
      });

      it('does nothing when the merchant is already on Trial', async () => {
        subs.getForBusiness.mockResolvedValue(paidSub({ kind: MerchantSubscriptionKind.TRIAL, stripeSubscriptionId: null }));
        const result = await service.changeBusinessPlan('biz-1', 'Trial');
        expect(result.billingChanged).toBe(false);
        expect(assignFreePlan).not.toHaveBeenCalled();
      });
    });

    it('leaves a lapsed paid subscription alone', async () => {
      subs.getForBusiness.mockResolvedValue(paidSub({ status: MerchantSubscriptionStatus.CANCELED }));
      await service.changeBusinessPlan('biz-1', 'Growth');
      expect(stripe.changeSubscriptionPrice).not.toHaveBeenCalled();
      expect(businessRepo.update).toHaveBeenCalled();
    });

    it('does nothing when the merchant is already on that plan', async () => {
      const result = await service.changeBusinessPlan('biz-1', 'Starter');
      expect(result.billingChanged).toBe(false);
      expect(businessRepo.update).not.toHaveBeenCalled();
      expect(stripe.changeSubscriptionPrice).not.toHaveBeenCalled();
    });

    it('does not change the plan if Stripe refuses, so the plan and the billing never disagree', async () => {
      subs.getForBusiness.mockResolvedValue(paidSub());
      stripe.changeSubscriptionPrice.mockRejectedValue(new BadRequestException('nope'));
      await expect(service.changeBusinessPlan('biz-1', 'Growth')).rejects.toThrow('nope');
      expect(businessRepo.update).not.toHaveBeenCalled();
    });

    it('refuses a plan with no Stripe price for a card-paying merchant', async () => {
      subs.getForBusiness.mockResolvedValue(paidSub());
      current.subscriptionPrices.Pro.priceId = '';
      await expect(service.changeBusinessPlan('biz-1', 'Pro')).rejects.toThrow(/no Stripe price/);
      expect(businessRepo.update).not.toHaveBeenCalled();
    });

    it('refuses an unknown plan, a missing business and an unapproved one', async () => {
      await expect(service.changeBusinessPlan('biz-1', 'Gold')).rejects.toBeInstanceOf(BadRequestException);
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.changeBusinessPlan('nope', 'Growth')).rejects.toBeInstanceOf(NotFoundException);
      businessRepo.findOne.mockResolvedValue({ id: 'b', status: BusinessStatus.PENDING, planTier: 'Starter' });
      await expect(service.changeBusinessPlan('b', 'Growth')).rejects.toThrow(/approved/);
    });
  });
});
