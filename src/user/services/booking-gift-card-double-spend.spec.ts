import { BookingService } from './booking.service';
import {
  BusinessGiftCardSoldStatus,
  BusinessGiftCardStatus,
} from 'src/business/enum/gift-card.enum';

// completeBooking() runs after a Paystack payment verifies. It can genuinely be called more than
// once for the same payment — a page refresh, a retried request, two tabs open on the same order —
// and unlike its sibling (the full-gift-card, no-card-needed path a few hundred lines up), it used
// to decrement the gift card with no lock and no balance check, so a repeat call spent the same
// balance again. These tests pin down the fix: a second call for an already-confirmed order must
// not touch the gift card a second time, and a call that would overdraw it must be refused outright.

const BUSINESS = 'biz-1';

function setup(opts: { giftBalance: number; giftCardAmount: number; alreadyConfirmedCount?: number }) {
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
    amount: 35,
    status: 'Pending',
    serviceName: 'Nail service',
    date: '2026-09-24',
    time: '14:30',
    business: { id: BUSINESS, businessName: 'Salon', owner: { id: 'owner-1' } },
  };

  const user: any = { id: 'cust-1', email: 'c@example.com', firstName: 'Cee', surname: 'Customer' };

  const manager = {
    find: jest.fn().mockImplementation((entity: any) =>
      // First call is for Appointment, no others needed for this path.
      Promise.resolve([appointment]),
    ),
    findOne: jest.fn().mockImplementation((entity: any, opts: any) => {
      if (entity?.name === 'User' || opts?.where?.id === user.id) return Promise.resolve(user);
      return Promise.resolve(giftCardRow);
    }),
    save: jest.fn(async (_entity: any, value: any) => value),
    update: jest.fn(),
  };

  const dataSource = { manager: { transaction: (callback: any) => callback(manager) } };

  const bookingRepository = {
    count: jest.fn().mockResolvedValue(opts.alreadyConfirmedCount ?? 0),
  };

  const paystack = {
    verifyPayment: jest.fn().mockResolvedValue({
      status: 'success',
      amount: 1500, // kobo — the card portion, unrelated to the gift card portion below
      metadata: {
        bookingAmount: 35,
        acquisitionFeeAmount: 0,
        commissionAmount: 0,
        giftCard: 'GC-1',
        giftCardAmount: opts.giftCardAmount,
        orderId: 'ORD-1',
        userId: 'cust-1',
        reference: 'ref-1',
      },
      authorization: {},
      customer: {},
    }),
  };

  const noop: any = {};
  const service = new BookingService(
    bookingRepository as any, // bookingRepository
    { findOne: jest.fn().mockResolvedValue(appointment.business) } as any, // businessRepository
    noop, noop, // service/staff repos
    { create: jest.fn((v: any) => v), save: jest.fn(async (v: any) => v) } as any, // transactionRepository
    { findOne: jest.fn().mockResolvedValue(giftCardRow) } as any, // giftCardRepository
    noop, noop, // clientRepository, cardRepository
    noop, // stripePaymentIntentRepository
    noop, noop, noop, noop, // refund/acquisition/membershipPackage/membershipPurchase
    { findOne: jest.fn().mockResolvedValue(user) } as any, // userRepository
    noop, // platformSettingsService
    noop, // reviewService
    dataSource as any,
    paystack as any,
    noop, // stripeService
    {
      getWalletByBusinessId: jest.fn().mockResolvedValue({}),
      createWalletForBusiness: jest.fn().mockResolvedValue({}),
      addFunds: jest.fn().mockResolvedValue({}),
    } as any, // walletService
    { sendBookingConfirmationEmail: jest.fn() } as any, // emailService
    noop, // templateService
    { getSettings: jest.fn().mockResolvedValue({ emailBookingConfirmations: false }) } as any,
    { create: jest.fn().mockResolvedValue(undefined) } as any, // notificationService
    { notify: jest.fn().mockResolvedValue(undefined) } as any, // slackService
    { onBookingConfirmed: jest.fn().mockResolvedValue(undefined) } as any, // integrationSync
  );
  jest.spyOn(service as any, 'shouldSendBookingConfirmationEmail').mockResolvedValue(false);
  jest.spyOn(service as any, 'notifyMerchantOfNewBooking').mockResolvedValue(undefined);

  return { service, giftCardRow, manager };
}

describe('completeBooking does not let a gift card be double-spent', () => {
  it('decrements the gift card on the first, genuine confirmation', async () => {
    const { service, giftCardRow } = setup({ giftBalance: 35, giftCardAmount: 35, alreadyConfirmedCount: 0 });

    const result = await service.completeBooking('ref-1');

    expect(result.giftCardAmountUsed).toBe(35);
    expect(giftCardRow.remainingAmount).toBe(0);
    expect(giftCardRow.status).toBe(BusinessGiftCardStatus.USED);
  });

  it('does not touch the gift card again on a repeat call for an order already confirmed', async () => {
    const { service, giftCardRow, manager } = setup({
      giftBalance: 35,
      giftCardAmount: 35,
      alreadyConfirmedCount: 1, // this order was already confirmed once
    });

    await service.completeBooking('ref-1');

    // The balance is untouched — the whole gift-card block was skipped, not just re-run harmlessly.
    expect(giftCardRow.remainingAmount).toBe(35);
    expect(giftCardRow.status).toBe(BusinessGiftCardStatus.ACTIVE);
    expect(manager.save).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ code: 'GC-1' }));
  });

  it('refuses to overdraw a gift card instead of going negative', async () => {
    const { service } = setup({ giftBalance: 10, giftCardAmount: 35, alreadyConfirmedCount: 0 });

    await expect(service.completeBooking('ref-1')).rejects.toThrow('Insufficient gift card balance');
  });
});
