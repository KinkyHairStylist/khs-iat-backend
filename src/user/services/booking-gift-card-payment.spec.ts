import { BookingService } from './booking.service';
import {
  BusinessGiftCardSoldStatus,
  BusinessGiftCardStatus,
} from 'src/business/enum/gift-card.enum';

// A gift card's money reaches the salon when the card is bought (less KHS's commission), so
// spending it on a booking must not pay the salon a second time or charge commission again.

const BUSINESS = 'biz-1';
const COMMISSION_RATE = 12;

function setup(opts: { giftBalance: number; bookingAmount?: number; firstBooking?: boolean }) {
  const bookingAmount = opts.bookingAmount ?? 35;

  const giftCardRow: any = {
    code: 'GC-1',
    businessId: BUSINESS,
    soldStatus: BusinessGiftCardSoldStatus.PURCHASED,
    status: BusinessGiftCardStatus.ACTIVE,
    remainingAmount: opts.giftBalance,
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  const appointment: any = {
    id: 'appt-1',
    orderId: 'ORD-1',
    amount: bookingAmount,
    status: 'Pending',
    serviceName: 'Nail service',
    date: '2026-09-24',
    time: '14:30',
    business: {
      id: BUSINESS,
      businessName: 'Salon',
      ownerId: 'owner-1',
      owner: { id: 'owner-1' },
      planTier: 'starter',
      ownerSettings: {},
    },
  };

  const walletService = {
    getWalletByBusinessId: jest.fn().mockResolvedValue({}),
    createWalletForBusiness: jest.fn(),
    addFunds: jest.fn().mockResolvedValue({}),
    debitWithPendingFallback: jest.fn().mockResolvedValue({}),
  };

  const manager = {
    findOne: jest.fn().mockResolvedValue(giftCardRow),
    save: jest.fn(async (_entity: any, value: any) => value),
    create: jest.fn((_entity: any, value: any) => value),
    update: jest.fn(),
  };

  const insertChain: any = {};
  for (const step of ['insert', 'into', 'values', 'orIgnore', 'returning']) {
    insertChain[step] = jest.fn().mockReturnValue(insertChain);
  }
  // A first booking with this salon returns one row; a repeat customer returns none.
  insertChain.execute = jest.fn().mockResolvedValue({ raw: opts.firstBooking ? [{ id: 1 }] : [] });

  const dataSource = {
    manager: { transaction: (callback: any) => callback(manager) },
    createQueryBuilder: () => insertChain,
  };

  const platformSettingsService = {
    getPayments: jest.fn().mockResolvedValue({
      commissionRate: COMMISSION_RATE,
      acquisitionFeeTiers: { starter: 10 },
      stripePassthroughRate: 1.75,
      stripePassthroughFixedFee: 0.3,
    }),
  };

  const stripePaymentIntentRepository = {
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => value),
  };
  const transactionRepository = {
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => value),
  };

  const stripeService = {
    createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_1', client_secret: 'secret' }),
  };

  const noop: any = {};
  const service = new BookingService(
    { find: jest.fn().mockResolvedValue([appointment]) } as any, // bookingRepository
    noop, // businessRepository
    noop, // serviceRepository
    noop, // staffRepository
    transactionRepository as any,
    { findOne: jest.fn().mockResolvedValue(giftCardRow) } as any, // giftCardRepository
    noop, // clientRepository
    noop, // cardRepository
    stripePaymentIntentRepository as any,
    noop, // refundRepository
    noop, // businessClientAcquisitionRepository
    noop, // membershipPackageRepository
    noop, // membershipPurchaseRepository
    noop, // userRepository
    platformSettingsService as any,
    noop, // reviewService
    dataSource as any,
    noop, // paystack
    stripeService as any,
    walletService as any,
    { sendBookingConfirmationEmail: jest.fn() } as any, // emailService
    noop, // templateService
    { getSettings: jest.fn().mockResolvedValue({ emailBookingConfirmations: false }) } as any,
    noop, // notificationService
    { notify: jest.fn() } as any, // slackService
    { onBookingConfirmed: jest.fn().mockResolvedValue(undefined) } as any, // integrationSync
  );
  jest.spyOn(service as any, 'notifyMerchantOfNewBooking').mockResolvedValue(undefined);

  const user: any = { id: 'cust-1', email: 'c@example.com', firstName: 'Cee', surname: 'Customer' };
  const confirm = () =>
    service.confirmBooking({ orderId: 'ORD-1', giftCard: 'GC-1', paymentProvider: 'stripe' }, user);

  return { confirm, giftCardRow, walletService, stripePaymentIntentRepository, stripeService };
}

describe('paying a booking with a gift card', () => {
  it('does not credit the salon again when the gift card pays the whole booking', async () => {
    const { confirm, giftCardRow, walletService } = setup({ giftBalance: 100 });

    const result = await confirm();

    expect(result.success).toBe(true);
    expect(giftCardRow.remainingAmount).toBe(65);
    expect(walletService.addFunds).not.toHaveBeenCalled();
  });

  it('charges no commission on the part a gift card pays', async () => {
    const { confirm } = setup({ giftBalance: 100 });

    const result = await confirm();

    expect(result.fees).toEqual({ acquisitionFee: 0, commission: 0 });
  });

  it('takes commission only on the part paid by card when the gift card covers some of it', async () => {
    const { confirm, stripePaymentIntentRepository, stripeService } = setup({ giftBalance: 20 });

    const result = await confirm();

    // $35 booking, $20 from the gift card, so $15 goes on the card and 12% of that is $1.80.
    expect(result.fees.commission).toBeCloseTo(1.8, 2);
    expect(stripePaymentIntentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ bookingAmount: 15, commissionFeeAmount: expect.closeTo(1.8, 2) }),
    );
    // The customer is charged the $15 plus the card fee, never the commission.
    const chargedCents = stripeService.createPaymentIntent.mock.calls[0][0].amount;
    expect(chargedCents).toBe(Math.round((15 + (15 * 1.75) / 100 + 0.3) * 100));
  });

  it('still charges the acquisition fee on a first booking paid entirely by gift card', async () => {
    const { confirm, walletService } = setup({ giftBalance: 100, firstBooking: true });

    const result = await confirm();

    // 10% of the $35 booking, debited from the salon's wallet. The salon is not credited again.
    expect(result.fees.acquisitionFee).toBeCloseTo(3.5, 2);
    expect(walletService.debitWithPendingFallback).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS, amount: expect.closeTo(3.5, 2), feeSubtype: 'Acquisition' }),
    );
    expect(walletService.addFunds).not.toHaveBeenCalled();
  });

  it('keeps the acquisition fee on the whole booking when a gift card covers only part of a first booking', async () => {
    const { confirm, stripePaymentIntentRepository } = setup({ giftBalance: 20, firstBooking: true });

    const result = await confirm();

    expect(result.fees.acquisitionFee).toBeCloseTo(3.5, 2);
    expect(result.fees.commission).toBeCloseTo(1.8, 2);
    expect(stripePaymentIntentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisitionFeeAmount: expect.closeTo(3.5, 2),
        commissionFeeAmount: expect.closeTo(1.8, 2),
      }),
    );
  });

  it('does not charge the acquisition fee again for a repeat customer', async () => {
    const { confirm, walletService } = setup({ giftBalance: 100, firstBooking: false });

    await confirm();

    expect(walletService.debitWithPendingFallback).not.toHaveBeenCalled();
  });
});
