import { NotFoundException } from '@nestjs/common';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import {
  BusinessGiftCardSoldStatus,
  BusinessGiftCardStatus,
} from 'src/business/enum/gift-card.enum';
import { GiftCardService } from './gift-card.service';

const SALON = 'salon-1';

const card = (over: Partial<BusinessGiftCard> = {}) =>
  ({
    code: 'CODE-1',
    businessId: SALON,
    soldStatus: BusinessGiftCardSoldStatus.PURCHASED,
    status: BusinessGiftCardStatus.ACTIVE,
    remainingAmount: 40,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...over,
  }) as BusinessGiftCard;

const serviceFor = (found: BusinessGiftCard | null) => {
  const repo = { findOne: jest.fn().mockResolvedValue(found) };
  const none = {} as any;
  return new GiftCardService(repo as any, none, none, none, none, none, none, none, none, none, none);
};

describe('GiftCardService.validateGiftCard', () => {
  it('accepts a sold, active, unexpired card with a balance', async () => {
    const result = await serviceFor(card()).validateGiftCard({ code: 'CODE-1' });
    expect(result).toMatchObject({ valid: true, amount: 40, status: BusinessGiftCardStatus.ACTIVE });
  });

  it('accepts it at the salon that issued it', async () => {
    const result = await serviceFor(card()).validateGiftCard({ code: 'CODE-1', businessId: SALON });
    expect(result.valid).toBe(true);
  });

  it('reports a card from another salon as invalid, with a reason code', async () => {
    const result = await serviceFor(card()).validateGiftCard({ code: 'CODE-1', businessId: 'salon-2' });
    expect(result).toMatchObject({ valid: false, reasonCode: 'wrong_salon' });
  });

  it('throws when the code does not exist', async () => {
    await expect(serviceFor(null).validateGiftCard({ code: 'NOPE' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports an expired card as invalid', async () => {
    const result = await serviceFor(card({ expiresAt: new Date(Date.now() - 1000) })).validateGiftCard({ code: 'CODE-1' });
    expect(result).toMatchObject({ valid: false, reason: 'Gift card expired' });
  });

  it('reports unsold stock as invalid', async () => {
    const result = await serviceFor(card({ soldStatus: BusinessGiftCardSoldStatus.AVAILABLE })).validateGiftCard({ code: 'CODE-1' });
    expect(result).toMatchObject({ valid: false, reason: 'Gift card not purchased' });
  });

  it('reports an empty card as invalid', async () => {
    const result = await serviceFor(card({ remainingAmount: 0 })).validateGiftCard({ code: 'CODE-1' });
    expect(result.valid).toBe(false);
  });

  it('reports a deactivated card as invalid', async () => {
    const result = await serviceFor(card({ status: BusinessGiftCardStatus.INACTIVE })).validateGiftCard({ code: 'CODE-1' });
    expect(result).toMatchObject({ valid: false, reason: 'Gift card is not active' });
  });
});
