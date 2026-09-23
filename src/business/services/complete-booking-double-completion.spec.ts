import { BadRequestException } from '@nestjs/common';
import { BusinessService } from './business.service';
import { AppointmentStatus } from '../entities/appointment.entity';

// completeBooking used to have no guard at all against being called twice
// for the same appointment — found live: a real booking's Stripe escrow was
// released three times, crediting the merchant's wallet three times for a
// single completion. This proves the fix: a second completion attempt (once
// the first has already flipped the appointment to a terminal status) is
// refused, and the wallet-crediting escrow release only ever runs once.

function setup() {
  const service: any = Object.create(BusinessService.prototype);

  // A single mutable record standing in for the DB row — this is what
  // makes the test meaningful: the second call reads whatever the first
  // call's "transaction" already wrote, the same way a real row lock
  // would force a second concurrent request to see the first one's result
  // rather than stale data.
  const record: any = {
    id: 'a1',
    orderId: 'order-1',
    status: AppointmentStatus.CONFIRMED,
    client: null,
    business: { id: 'biz-1', ownerId: 'owner-1', businessName: 'Gold Salon' },
    staff: [],
  };

  service.assertCanActOnAppointment = jest.fn().mockResolvedValue(undefined);
  service.emailService = { sendEmail: jest.fn() };
  service.notificationService = { create: jest.fn() };
  service.appointmentRepo = {
    findOne: jest.fn(async () => ({ ...record })),
    manager: {
      transaction: jest.fn(async (fn: any) =>
        fn({
          findOne: async () => record, // the *same* object — mutations below are visible to the next call
          save: async (_entity: any, data: any) => Object.assign(record, data),
        }),
      ),
    },
  };
  service.businessOwnerSettingsService = {
    findByBusinessId: jest.fn().mockResolvedValue({ integrations: {} }),
  };
  const heldIntent = {
    stripePaymentIntentId: 'pi_1',
    orderId: 'order-1',
    status: 'held',
    bookingAmount: 100,
    acquisitionFeeAmount: 0,
    commissionFeeAmount: 0,
    userId: 'customer-1',
  };
  service.stripePaymentIntentRepo = {
    find: jest.fn(async () => (heldIntent.status === 'held' ? [heldIntent] : [])),
    save: jest.fn(async (spi: any) => Object.assign(heldIntent, spi)),
  };
  service.walletService = {
    getWalletByBusinessId: jest.fn().mockResolvedValue({}),
    addFundsPending: jest.fn(),
  };
  service.staffCommissionEarningRepo = { save: jest.fn() };

  return { service, heldIntent };
}

describe('completeBooking — double completion', () => {
  it('refuses a second completion attempt once the first has already gone through', async () => {
    const { service } = setup();
    const me: any = { id: 'owner-1' };

    const first = await service.completeBooking('a1', me);
    expect(first.status).toBe(AppointmentStatus.COMPLETED);

    await expect(service.completeBooking('a1', me)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only credits the wallet once, no matter how many completion attempts race in', async () => {
    const { service } = setup();
    const me: any = { id: 'owner-1' };

    await service.completeBooking('a1', me);
    await service.completeBooking('a1', me).catch(() => {}); // expected to be refused
    await service.completeBooking('a1', me).catch(() => {}); // expected to be refused

    expect(service.walletService.addFundsPending).toHaveBeenCalledTimes(1);
  });
});
