import { GiftCardService } from './gift-card.service';
import { User } from 'src/all_user_entities/user.entity';
import { BusinessGiftCardSoldStatus } from 'src/business/enum/gift-card.enum';

// KHS's commission comes out of what the salon is paid when a gift card is sold.

function setup(commissionRate: number) {
  const giftCard: any = {
    id: 'gc-1',
    code: 'GC-1',
    title: 'Spa credit',
    businessId: 'biz-1',
    currency: 'USD',
    expiryInDays: 365,
    soldStatus: BusinessGiftCardSoldStatus.AVAILABLE,
  };
  const withRelations = { ...giftCard, business: { id: 'biz-1', ownerId: 'owner-1' } };
  const purchaser = { id: 'cust-1', email: 'c@example.com', firstName: 'Cee', surname: 'Customer' };

  const manager = {
    findOne: jest.fn(async (entity: any, options: any) => {
      if (entity === User) return purchaser;
      return options?.relations ? withRelations : giftCard;
    }),
    save: jest.fn(async (_entity: any, value: any) => value),
    update: jest.fn(),
  };

  const walletService = { addFunds: jest.fn().mockResolvedValue({}) };
  const transactionRepo = {
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => value),
  };

  const service = new GiftCardService(
    {} as any, // giftCardRepo
    {} as any, // cardRepo
    transactionRepo as any,
    { manager: { transaction: (callback: any) => callback(manager) } } as any, // dataSource
    walletService as any,
    {} as any, // paystack
    {
      retrievePaymentIntent: jest.fn().mockResolvedValue({
        status: 'succeeded',
        metadata: {
          giftCardId: 'gc-1',
          purchaserId: 'cust-1',
          giftCardAmount: '100',
          feeAmount: '5',
        },
      }),
    } as any,
    { getPayments: jest.fn().mockResolvedValue({ commissionRate }) } as any,
    { sendGiftCardEmail: jest.fn() } as any,
    { notify: jest.fn() } as any,
  );

  return { complete: () => service.completeGiftCardPurchase('pi_1'), walletService, transactionRepo };
}

describe('buying a gift card', () => {
  it('credits the salon the card value less the commission', async () => {
    const { complete, walletService } = setup(12);

    await complete();

    expect(walletService.addFunds).toHaveBeenCalledTimes(1);
    expect(walletService.addFunds).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-1', amount: 88 }));
  });

  it('records the commission as KHS revenue against the salon', async () => {
    const { complete, transactionRepo } = setup(12);

    await complete();

    expect(transactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: 'owner-1', amount: 12, feeSubtype: 'Commission', referenceId: 'pi_1' }),
    );
  });

  it('credits the full value and records nothing when there is no commission', async () => {
    const { complete, walletService, transactionRepo } = setup(0);

    await complete();

    expect(walletService.addFunds).toHaveBeenCalledWith(expect.objectContaining({ amount: 100 }));
    expect(transactionRepo.save).not.toHaveBeenCalled();
  });
});
