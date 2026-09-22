import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessGiftCardSoldStatus, BusinessGiftCardStatus } from 'src/business/enum/gift-card.enum';
import { GiftcardService } from './admin_giftcard.service';

jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));

const card = (over: Record<string, any> = {}) => ({
  id: 'c1',
  code: 'KSH123',
  amount: '200.00',
  remainingAmount: '100.00',
  status: BusinessGiftCardStatus.ACTIVE,
  soldStatus: BusinessGiftCardSoldStatus.PURCHASED,
  comment: null,
  ...over,
});

describe('GiftcardService (admin)', () => {
  let repo: { findOne: jest.Mock; save: jest.Mock; find: jest.Mock };
  let service: GiftcardService;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(async (c: any) => c),
      find: jest.fn().mockResolvedValue([]),
    };
    service = new GiftcardService(repo as any, {} as any);
  });

  describe('restoreBalance', () => {
    it("puts a sold card's balance back to its full value, never above it", async () => {
      repo.findOne.mockResolvedValue(card());
      const result = await service.restoreBalance('c1', 'Redeemed by mistake', 'admin@khs.test');
      expect(result.updatedBalance).toBe(200);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ remainingAmount: 200, comment: expect.stringContaining('100.00 to 200.00') }),
      );
    });

    it('needs no amount, so nobody can name their own balance', async () => {
      expect(service.restoreBalance.length).toBeLessThanOrEqual(3);
      repo.findOne.mockResolvedValue(card({ amount: '50.00', remainingAmount: '0.00' }));
      const result = await service.restoreBalance('c1', 'x');
      expect(result.updatedBalance).toBe(50);
    });

    it('refuses unsold cards, cards that are not active, and cards already at full value', async () => {
      repo.findOne.mockResolvedValue(card({ soldStatus: BusinessGiftCardSoldStatus.AVAILABLE }));
      await expect(service.restoreBalance('c1', 'x')).rejects.toThrow(/has been sold/);

      repo.findOne.mockResolvedValue(card({ status: BusinessGiftCardStatus.EXPIRED }));
      await expect(service.restoreBalance('c1', 'x')).rejects.toThrow(/not active/);

      repo.findOne.mockResolvedValue(card({ remainingAmount: '200.00' }));
      await expect(service.restoreBalance('c1', 'x')).rejects.toThrow(/full balance/);

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('refuses an unknown card', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.restoreBalance('nope', 'x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is not a way to raise a card above its value even if it somehow already is', async () => {
      repo.findOne.mockResolvedValue(card({ remainingAmount: '300.00' }));
      await expect(service.restoreBalance('c1', 'x')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it("leaves out deleted cards and adds the salon's name", async () => {
      repo.find.mockResolvedValue([{ id: 'c1', code: 'A', business: { businessName: 'Da Liv' } }]);
      const result = await service.findAll();
      const options = repo.find.mock.calls[0][0];
      expect(JSON.stringify(options.where.status)).toContain('not');
      expect(result.data[0]).toMatchObject({ businessName: 'Da Liv' });
      expect(result.data[0]).not.toHaveProperty('business');
    });
  });

  it('no longer has a way to wipe every gift card', () => {
    expect((service as any).deleteAllGiftCards).toBeUndefined();
  });
});
