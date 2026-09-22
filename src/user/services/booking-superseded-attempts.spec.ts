import { BookingService } from './booking.service';
import { StripeEscrowStatus } from 'src/payment/entities/stripe-payment-intent.entity';
import { TransactionStatus } from 'src/business/entities/transaction.entity';

// Starting a new card payment for an order cancels the earlier unpaid ones, unless one was paid.

function setup(stale: { id: string; stripeStatus: string }[]) {
  const appointment: any = {
    id: 'appt-1',
    orderId: 'ORD-1',
    amount: 35,
    status: 'Pending',
    serviceName: 'Nail service',
    date: '2026-09-24',
    time: '14:30',
    business: { id: 'biz-1', businessName: 'Salon', ownerId: 'owner-1', owner: { id: 'owner-1' }, planTier: 'starter', ownerSettings: {} },
  };

  const insertChain: any = {};
  for (const step of ['insert', 'into', 'values', 'orIgnore', 'returning']) {
    insertChain[step] = jest.fn().mockReturnValue(insertChain);
  }
  insertChain.execute = jest.fn().mockResolvedValue({ raw: [] });

  const stripeService = {
    createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_new', client_secret: 'secret' }),
    retrievePaymentIntent: jest.fn(async (id: string) => ({ id, status: stale.find((s) => s.id === id)?.stripeStatus })),
    cancelPaymentIntent: jest.fn().mockResolvedValue({}),
  };
  const stripePaymentIntentRepository = {
    find: jest.fn().mockResolvedValue(stale.map((s) => ({ stripePaymentIntentId: s.id, orderId: 'ORD-1', status: StripeEscrowStatus.PENDING }))),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => v),
    update: jest.fn().mockResolvedValue({}),
  };
  const transactionRepository = {
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => v),
    update: jest.fn().mockResolvedValue({}),
  };

  const noop: any = {};
  const service = new BookingService(
    { find: jest.fn().mockResolvedValue([appointment]) } as any,
    noop,
    noop,
    noop,
    transactionRepository as any,
    noop,
    noop,
    noop,
    stripePaymentIntentRepository as any,
    noop,
    noop,
    noop,
    noop,
    noop,
    {
      getPayments: jest.fn().mockResolvedValue({
        commissionRate: 12,
        acquisitionFeeTiers: { starter: 10 },
        stripePassthroughRate: 1.75,
        stripePassthroughFixedFee: 0.3,
      }),
    } as any,
    noop,
    { manager: { transaction: (cb: any) => cb({}) }, createQueryBuilder: () => insertChain } as any,
    noop,
    stripeService as any,
    noop,
    noop,
    noop,
    noop,
    noop,
    { notify: jest.fn() } as any,
    noop,
  );

  const user: any = { id: 'cust-1', email: 'c@example.com', firstName: 'Cee', surname: 'Customer' };
  const start = async () => {
    const result = await service.confirmBooking({ orderId: 'ORD-1', paymentProvider: 'stripe' }, user);
    // The cancelling runs alongside; give it a moment to finish.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return result;
  };
  return { start, stripeService, stripePaymentIntentRepository, transactionRepository };
}

describe('starting a new card payment for an order', () => {
  it('cancels an earlier unpaid attempt in Stripe and in the ledger', async () => {
    const { start, stripeService, stripePaymentIntentRepository, transactionRepository } = setup([
      { id: 'pi_old', stripeStatus: 'requires_payment_method' },
    ]);

    const result: any = await start();

    expect(result.clientSecret).toBe('secret');
    expect(stripeService.cancelPaymentIntent).toHaveBeenCalledWith('pi_old');
    expect(stripePaymentIntentRepository.update).toHaveBeenCalledWith(
      { stripePaymentIntentId: 'pi_old' },
      { status: StripeEscrowStatus.CANCELLED },
    );
    expect(transactionRepository.update).toHaveBeenCalledWith(
      { referenceId: 'pi_old', status: TransactionStatus.PENDING },
      { status: TransactionStatus.CANCELLED },
    );
  });

  it('leaves an attempt alone that was paid or is being paid', async () => {
    const { start, stripeService, stripePaymentIntentRepository } = setup([
      { id: 'pi_paid', stripeStatus: 'succeeded' },
      { id: 'pi_paying', stripeStatus: 'processing' },
    ]);

    await start();

    expect(stripeService.cancelPaymentIntent).not.toHaveBeenCalled();
    expect(stripePaymentIntentRepository.update).not.toHaveBeenCalled();
  });

  it('does not touch the new attempt', async () => {
    const { start, stripeService } = setup([{ id: 'pi_old', stripeStatus: 'requires_payment_method' }]);

    await start();

    expect(stripeService.cancelPaymentIntent).not.toHaveBeenCalledWith('pi_new');
  });

  it('still starts the payment when cancelling the old one fails', async () => {
    const { start, stripeService } = setup([{ id: 'pi_old', stripeStatus: 'requires_payment_method' }]);
    stripeService.cancelPaymentIntent.mockRejectedValue(new Error('Stripe is down'));

    const result: any = await start();

    expect(result.clientSecret).toBe('secret');
  });

  it('cancels at most ten old attempts at a time', async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: `pi_${i}`, stripeStatus: 'requires_payment_method' }));
    const { start, stripeService } = setup(many);

    await start();

    expect(stripeService.cancelPaymentIntent).toHaveBeenCalledTimes(10);
  });
});
