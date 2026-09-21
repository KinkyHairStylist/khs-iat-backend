import { BadRequestException } from '@nestjs/common';
import { BookingService } from './booking.service';

// A service with no price can't be booked, a free one is confirmed without a payment, and a booking
// too small for Stripe says so.

function build(opts: { service?: any; appointmentAmount?: number } = {}) {
  const appointment: any = {
    id: 'appt-1',
    orderId: 'ORD-1',
    amount: opts.appointmentAmount ?? 0,
    status: 'Pending',
    serviceName: 'Nail service',
    date: '2026-09-24',
    time: '14:30',
    business: {
      id: 'biz-1',
      businessName: 'Salon',
      ownerId: 'owner-1',
      owner: { id: 'owner-1' },
      planTier: 'starter',
      ownerSettings: {},
    },
  };

  const manager = { save: jest.fn(async (_e: any, v: any) => v) };
  const insertChain: any = {};
  for (const step of ['insert', 'into', 'values', 'orIgnore', 'returning']) {
    insertChain[step] = jest.fn().mockReturnValue(insertChain);
  }
  insertChain.execute = jest.fn().mockResolvedValue({ raw: [{ id: 1 }] });
  const createQueryBuilder = jest.fn().mockReturnValue(insertChain);

  const stripeService = { createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pi_1', client_secret: 's' }) };
  const emailService = { sendBookingConfirmationEmail: jest.fn() };

  const noop: any = {};
  const service = new BookingService(
    { find: jest.fn().mockResolvedValue([appointment]), create: jest.fn((v: any) => v), save: jest.fn() } as any,
    { findOne: jest.fn().mockResolvedValue({ id: 'biz-1', bookingPolicies: null, ownerSettings: {} }) } as any,
    { findOne: jest.fn().mockResolvedValue(opts.service) } as any,
    noop,
    { create: jest.fn((v: any) => v), save: jest.fn() } as any,
    noop,
    noop,
    noop,
    { create: jest.fn((v: any) => v), save: jest.fn() } as any,
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
    { manager: { transaction: (cb: any) => cb(manager) }, createQueryBuilder } as any,
    noop,
    stripeService as any,
    noop,
    emailService as any,
    noop,
    { getSettings: jest.fn().mockResolvedValue({ emailBookingConfirmations: false }) } as any,
    noop,
    { notify: jest.fn() } as any,
    { onBookingConfirmed: jest.fn().mockResolvedValue(undefined) } as any,
  );
  jest.spyOn(service as any, 'notifyMerchantOfNewBooking').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'assertBookingAllowedByRules').mockResolvedValue(undefined);

  const user: any = { id: 'cust-1', email: 'c@example.com', firstName: 'Cee', surname: 'Customer' };
  return { service, user, appointment, stripeService, createQueryBuilder, emailService };
}

describe('booking a service with no price', () => {
  const dto = { salonId: 'biz-1', serviceIds: ['svc-1'], date: '2026-09-24', time: '14:30' };

  it('refuses a service that has no price at all', async () => {
    const { service, user } = build({ service: { id: 'svc-1', name: 'Nail Service', price: null, minPrice: null, maxPrice: null, duration: '60 mins' } });

    await expect(service.createBooking(dto, user)).rejects.toThrow(/doesn't have a price yet/);
  });

  it('books a variable-priced service at its minimum price', async () => {
    const { service, user } = build({ service: { id: 'svc-1', name: 'Colour', price: null, minPrice: 40, maxPrice: 90, duration: '60 mins' } });

    const { appointments } = await service.createBooking(dto, user);

    expect(appointments[0].amount).toBe(40);
  });

  it('allows a service that is free', async () => {
    const { service, user } = build({ service: { id: 'svc-1', name: 'Consultation', price: 0, minPrice: null, maxPrice: null, duration: '30 mins' } });

    const { appointments } = await service.createBooking(dto, user);

    expect(appointments[0].amount).toBe(0);
  });
});

describe('confirming a free booking', () => {
  it('confirms it without creating a payment or working out any fee', async () => {
    const { service, user, appointment, stripeService, createQueryBuilder } = build({ appointmentAmount: 0 });

    const result: any = await service.confirmBooking({ orderId: 'ORD-1', paymentProvider: 'stripe' }, user);

    expect(result.success).toBe(true);
    expect(appointment.status).toBe('Confirmed');
    expect(stripeService.createPaymentIntent).not.toHaveBeenCalled();
    // The customer's "first booking with this salon" is not used up by a free booking.
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });

  it('emails the customer', async () => {
    const { service, user, emailService } = build({ appointmentAmount: 0 });

    await service.confirmBooking({ orderId: 'ORD-1', paymentProvider: 'stripe' }, user);

    expect(emailService.sendBookingConfirmationEmail).toHaveBeenCalledTimes(1);
  });
});

describe('a booking too small for a card', () => {
  it('says so instead of failing quietly', async () => {
    // $0.10 booking: the card fee alone would make the charge $0.30, under Stripe's $0.50 minimum.
    const { service, user, stripeService } = build({ appointmentAmount: 0.1 });

    await expect(service.confirmBooking({ orderId: 'ORD-1', paymentProvider: 'stripe' }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(stripeService.createPaymentIntent).not.toHaveBeenCalled();
  });
});
