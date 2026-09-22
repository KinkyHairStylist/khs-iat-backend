import { MerchantSubscriptionKind, MerchantSubscriptionStatus } from '../entities/merchant-subscription.entity';
import { MerchantSubscriptionService } from './merchant-subscription.service';

jest.mock('../../services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));

const row = (over: Record<string, any> = {}) => ({
  businessId: 'biz-1',
  kind: MerchantSubscriptionKind.PAID,
  status: MerchantSubscriptionStatus.ACTIVE,
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_1',
  cancelReason: null,
  ...over,
});

describe('MerchantSubscriptionService — sign-up payments', () => {
  let repo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; createQueryBuilder: jest.Mock };
  let stripe: { cancelAndRefundSubscription: jest.Mock; createCustomerForBusiness: jest.Mock };
  let service: MerchantSubscriptionService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(async (v) => v),
      create: jest.fn((v) => v),
      createQueryBuilder: jest.fn(),
    };
    stripe = {
      cancelAndRefundSubscription: jest.fn().mockResolvedValue({ refundId: 're_1' }),
      createCustomerForBusiness: jest.fn().mockResolvedValue({ id: 'cus_new' }),
    };
    service = new MerchantSubscriptionService(repo as any, {} as any, stripe as any, {} as any, {} as any);
  });

  describe('cancelAndRefundForRejection', () => {
    it('cancels billing and refunds a merchant who paid at sign-up', async () => {
      const sub = row();
      repo.findOne.mockResolvedValue(sub);
      const result = await service.cancelAndRefundForRejection('biz-1');
      expect(stripe.cancelAndRefundSubscription).toHaveBeenCalledWith('sub_1', 'cus_1');
      expect(result).toEqual({ refunded: true, refundId: 're_1' });
      expect(sub.status).toBe(MerchantSubscriptionStatus.CANCELED);
      expect(sub.cancelReason).toBe('application_rejected');
    });

    it('refunds nothing for a merchant who never paid (Trial or MVP)', async () => {
      for (const kind of [MerchantSubscriptionKind.TRIAL, MerchantSubscriptionKind.REVEAL]) {
        repo.findOne.mockResolvedValue(row({ kind, stripeSubscriptionId: null }));
        expect(await service.cancelAndRefundForRejection('biz-1')).toEqual({ refunded: false, refundId: null });
      }
      expect(stripe.cancelAndRefundSubscription).not.toHaveBeenCalled();
    });

    it('does nothing when the business has no subscription record', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.cancelAndRefundForRejection('biz-1')).toEqual({ refunded: false, refundId: null });
    });

    it('lets a Stripe failure surface so the admin can be alerted, without marking it refunded', async () => {
      const sub = row();
      repo.findOne.mockResolvedValue(sub);
      stripe.cancelAndRefundSubscription.mockRejectedValue(new Error('stripe down'));
      await expect(service.cancelAndRefundForRejection('biz-1')).rejects.toThrow('stripe down');
      expect(sub.status).toBe(MerchantSubscriptionStatus.ACTIVE);
    });
  });

  describe('recording sign-ups', () => {
    it('records a paid merchant as active with their Stripe ids', async () => {
      const end = new Date('2026-11-01T00:00:00Z');
      const saved = await service.recordPaidSignup({ id: 'biz-1' } as any, {
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        currentPeriodEnd: end,
      });
      expect(saved).toMatchObject({
        businessId: 'biz-1',
        status: MerchantSubscriptionStatus.ACTIVE,
        kind: MerchantSubscriptionKind.PAID,
        trialEndsAt: null,
        currentPeriodEnd: end,
        stripeSubscriptionId: 'sub_1',
      });
    });

    it("puts an MVP merchant on trial until the window's shared end date", async () => {
      const end = new Date('2026-12-01T00:00:00Z');
      const saved = await service.recordRevealSignup({ id: 'biz-1', businessName: 'X' } as any, end);
      expect(saved).toMatchObject({
        status: MerchantSubscriptionStatus.TRIALING,
        kind: MerchantSubscriptionKind.REVEAL,
        trialEndsAt: end,
        stripeCustomerId: 'cus_new',
      });
    });
  });

  describe('moveRevealEnd', () => {
    it('moves only MVP merchants who are still trialing', async () => {
      const qb: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 4 }),
      };
      repo.createQueryBuilder.mockReturnValue(qb);
      const end = new Date('2027-01-01T00:00:00Z');
      expect(await service.moveRevealEnd(end)).toBe(4);
      expect(qb.set).toHaveBeenCalledWith({ trialEndsAt: end });
      expect(qb.where).toHaveBeenCalledWith('kind = :kind', { kind: MerchantSubscriptionKind.REVEAL });
      expect(qb.andWhere).toHaveBeenCalledWith('status = :status', {
        status: MerchantSubscriptionStatus.TRIALING,
      });
    });
  });
});
