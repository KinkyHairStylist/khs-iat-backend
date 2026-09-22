import { GiftCardService } from './gift-card.service';
import { User } from 'src/all_user_entities/user.entity';
import { BusinessGiftCardSoldStatus } from 'src/business/enum/gift-card.enum';

// Buying a gift card pays the salon the card's full value and tells everyone involved.
// KHS's commission and acquisition fee are taken later, when the card is spent on a booking.

function setup(opts: { alreadySold?: boolean } = {}) {
  const giftCard: any = {
    id: 'gc-1',
    code: 'GC-1',
    title: 'Spa credit',
    businessId: 'biz-1',
    currency: 'USD',
    expiryInDays: 365,
    soldStatus: opts.alreadySold ? BusinessGiftCardSoldStatus.PURCHASED : BusinessGiftCardSoldStatus.AVAILABLE,
  };
  const withRelations = {
    ...giftCard,
    business: {
      id: 'biz-1',
      ownerId: 'owner-1',
      businessName: 'KHS Seed Salon',
      ownerEmail: 'owner@example.com',
      ownerName: 'Olu Owner',
    },
  };
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
  const emailService = {
    sendGiftCardEmail: jest.fn(),
    sendMerchantGiftCardSoldEmail: jest.fn(),
    khsTeamEmail: 'team@example.com',
  };
  const slackService = { notify: jest.fn() };
  const notificationService = { create: jest.fn().mockResolvedValue({}) };

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
    {} as any, // platformSettingsService
    emailService as any,
    slackService as any,
    notificationService as any,
  );

  return {
    complete: () => service.completeGiftCardPurchase('pi_1'),
    walletService,
    transactionRepo,
    emailService,
    slackService,
    notificationService,
  };
}

describe('buying a gift card', () => {
  it('credits the salon the full value of the card', async () => {
    const { complete, walletService } = setup();

    await complete();

    expect(walletService.addFunds).toHaveBeenCalledTimes(1);
    expect(walletService.addFunds).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-1', amount: 100 }));
  });

  it('takes no commission at the sale', async () => {
    const { complete, transactionRepo } = setup();

    await complete();

    expect(transactionRepo.save).not.toHaveBeenCalled();
  });

  it('emails the buyer, tells KHS on Slack and notifies the salon in the app', async () => {
    const { complete, emailService, slackService, notificationService } = setup();

    await complete();

    expect(emailService.sendGiftCardEmail).toHaveBeenCalledWith(
      'c@example.com',
      expect.any(String),
      'purchased',
      expect.anything(),
      100,
      expect.anything(),
      expect.anything(),
      undefined,
      undefined,
    );
    expect(slackService.notify).toHaveBeenCalledWith(expect.stringContaining('KHS Seed Salon'));
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        title: 'Gift card sold',
        message: expect.stringContaining('$100.00'),
      }),
    );
  });

  it('emails the salon that its gift card was sold', async () => {
    const { complete, emailService } = setup();

    await complete();

    expect(emailService.sendMerchantGiftCardSoldEmail).toHaveBeenCalledWith(
      'owner@example.com',
      'Olu Owner',
      'KHS Seed Salon',
      'Cee Customer',
      'Spa credit',
      100,
    );
  });

  it('does not credit or notify again when the purchase of a sold card is completed a second time', async () => {
    const { complete, notificationService, walletService, emailService } = setup({ alreadySold: true });

    await complete();

    expect(walletService.addFunds).not.toHaveBeenCalled();
    expect(notificationService.create).not.toHaveBeenCalled();
    expect(emailService.sendMerchantGiftCardSoldEmail).not.toHaveBeenCalled();
  });
});
