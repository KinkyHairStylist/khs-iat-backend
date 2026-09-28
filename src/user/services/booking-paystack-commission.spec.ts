import { BookingService } from './booking.service';

// SPR-19-04-056: the Paystack completion callback credited the merchant's
// wallet with the raw gross bookingAmount. The acquisition/commission fee
// transactions created at initialization were only ever flipped from
// PENDING to COMPLETED here -- a pure status update, never an actual wallet
// debit -- so the fee was never really collected, and (when a gift card
// covered part of the order) that portion was credited to the merchant a
// second time on top of what it was already paid at gift-card purchase.

function build(opts: { verification?: any } = {}) {
  const noop: any = {};

  const appointment: any = {
    id: 'appt-1',
    orderId: 'ORD-1',
    status: 'Pending',
    business: { id: 'biz-1', businessName: 'Salon', owner: { id: 'owner-1' } },
  };

  const manager = {
    find: jest.fn().mockResolvedValue([appointment]),
    findOne: jest.fn().mockResolvedValue({ id: 'user-1', email: 'c@example.com', firstName: 'Cus' }),
    save: jest.fn(async (_e: any, v: any) => v),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const walletService = {
    getWalletByBusinessId: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
    createWalletForBusiness: jest.fn(),
    addFunds: jest.fn().mockResolvedValue(undefined),
    debitWithPendingFallback: jest.fn().mockResolvedValue(undefined),
  };

  const defaultVerification = {
    status: 'success',
    amount: 0,
    metadata: {
      orderId: 'ORD-1',
      userId: 'user-1',
      bookingAmount: 100,
      acquisitionFeeAmount: 5,
      commissionAmount: 12,
      giftCardAmount: 0,
      reference: 'BKG-1',
    },
    customer: {},
    authorization: {},
  };
  const paystack = {
    verifyPayment: jest.fn().mockResolvedValue(opts.verification ?? defaultVerification),
  };

  const emailService = { sendBookingConfirmationEmail: jest.fn() };
  const notificationService = { create: jest.fn() };
  const slackService = { notify: jest.fn() };
  const integrationSync = { onBookingConfirmed: jest.fn().mockResolvedValue(undefined) };

  const service = new BookingService(
    { count: jest.fn().mockResolvedValue(0) } as any,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    noop,
    { manager: { transaction: (cb: any) => cb(manager) } } as any,
    paystack as any,
    noop,
    walletService as any,
    emailService as any,
    noop,
    noop,
    notificationService as any,
    slackService as any,
    integrationSync as any,
  );

  jest.spyOn(service as any, 'shouldSendBookingConfirmationEmail').mockResolvedValue(false);
  jest.spyOn(service as any, 'notifyMerchantOfNewBooking').mockResolvedValue(undefined);

  return { service, walletService, manager };
}

describe('completeBooking (Paystack)', () => {
  it('credits the wallet net of the platform fee, not the raw gross bookingAmount', async () => {
    const { service, walletService } = build();

    await service.completeBooking('BKG-1');

    expect(walletService.addFunds).toHaveBeenCalledTimes(1);
    const call = (walletService.addFunds as jest.Mock).mock.calls[0][0];
    // 100 - 5 (acquisition) - 12 (commission) = 83, not the raw 100.
    expect(call.amount).toBe(83);
  });

  it('does not double-credit the portion a gift card already paid for', async () => {
    const { service, walletService } = build({
      verification: {
        status: 'success',
        amount: 3000, // kobo, i.e. $30 actually charged by card
        metadata: {
          orderId: 'ORD-1',
          userId: 'user-1',
          bookingAmount: 100,
          acquisitionFeeAmount: 5,
          commissionAmount: 12,
          giftCardAmount: 70,
          reference: 'BKG-1',
        },
        customer: {},
        authorization: {},
      },
    });

    await service.completeBooking('BKG-1');

    const call = (walletService.addFunds as jest.Mock).mock.calls[0][0];
    // Only the card-paid share (100 - 70 = 30) is new money to credit, minus
    // the fees: 30 - 5 - 12 = 13. Crediting the raw 100 would have paid the
    // merchant for the gift-card portion a second time.
    expect(call.amount).toBe(13);
  });

  it('debits the shortfall, split proportionally, when fees exceed what the card portion covers', async () => {
    const { service, walletService } = build({
      verification: {
        status: 'success',
        amount: 500,
        metadata: {
          orderId: 'ORD-1',
          userId: 'user-1',
          bookingAmount: 100,
          acquisitionFeeAmount: 5,
          commissionAmount: 12,
          giftCardAmount: 95, // only $5 left for the card to cover, less than the $17 fee
          reference: 'BKG-1',
        },
        customer: {},
        authorization: {},
      },
    });

    await service.completeBooking('BKG-1');

    expect(walletService.addFunds).not.toHaveBeenCalled();
    expect(walletService.debitWithPendingFallback).toHaveBeenCalledTimes(2);
    const amounts = (walletService.debitWithPendingFallback as jest.Mock).mock.calls
      .map((c: any[]) => c[0].amount)
      .sort((a: number, b: number) => a - b);
    // shortfall = 17 - 5 = 12, split proportionally 5:12 between acquisition and commission.
    expect(amounts[0] + amounts[1]).toBeCloseTo(12, 2);
  });
});
