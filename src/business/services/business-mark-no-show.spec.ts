import { BadRequestException } from '@nestjs/common';
import { BusinessService } from './business.service';
import { AppointmentStatus, PaymentStatus } from '../entities/appointment.entity';

// markNoShow: a merchant marking a past Confirmed/Rescheduled appointment as
// a no-show. It should behave like completeBooking financially (release any
// held Stripe escrow to the merchant) while recording a different, honest
// status and never allow marking a booking that hasn't happened yet, or one
// that's already in a terminal state.

function setup(overrides: Partial<Record<string, any>> = {}) {
  const service: any = Object.create(BusinessService.prototype);

  service.assertCanActOnAppointment = jest.fn().mockResolvedValue(undefined);
  service.emailService = { sendEmail: jest.fn() };
  service.notificationService = { create: jest.fn() };
  service.appointmentRepo = { findOne: jest.fn(), save: jest.fn(async (a: any) => a) };
  // claimAppointmentForTerminalTransition runs its locked read/write through
  // appointmentRepo.manager.transaction — delegate the manager's findOne/save
  // back to the same mocks above so existing per-test setups keep working.
  service.appointmentRepo.manager = {
    transaction: jest.fn(async (fn: any) =>
      fn({
        // The real implementation locks via a raw query (see
        // claimAppointmentForTerminalTransition's comment for why) before
        // ever loading the entity — derive its {id, status} row from the
        // same findOne mock every other call in this test already relies on.
        query: async () => {
          const appt = await service.appointmentRepo.findOne();
          return appt ? [{ id: appt.id, status: appt.status }] : [];
        },
        findOne: (_entity: any, opts: any) => service.appointmentRepo.findOne(opts),
        save: (_entity: any, data: any) => service.appointmentRepo.save(data),
      }),
    ),
  };
  service.stripePaymentIntentRepo = { find: jest.fn().mockResolvedValue([]), save: jest.fn() };
  service.businessOwnerSettingsService = {
    findByBusinessId: jest.fn().mockResolvedValue({ integrations: {} }),
  };
  service.logger = { error: jest.fn() };

  Object.assign(service, overrides);
  return service;
}

const YESTERDAY = { date: '2020-01-01', time: '2:00 PM' }; // always in the past
const FAR_FUTURE = { date: '2099-01-01', time: '2:00 PM' };

describe('markNoShow', () => {
  it('marks a past Confirmed appointment as No Show and notifies the client', async () => {
    const service = setup();
    const appointment = {
      id: 'a1',
      status: AppointmentStatus.CONFIRMED,
      ...YESTERDAY,
      client: { id: 'client-1', email: 'client@example.com' },
      business: { id: 'biz-1', businessName: 'Gold Salon' },
      serviceName: 'Braids',
    };
    service.appointmentRepo.findOne.mockResolvedValue(appointment);

    const result = await service.markNoShow('a1', { id: 'owner-1' });

    expect(result.status).toBe(AppointmentStatus.NO_SHOW);
    expect(result.paymentStatus).toBe(PaymentStatus.PAID);
    expect(service.notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'client-1', title: 'Marked as No-Show' }),
    );
    expect(service.emailService.sendEmail).toHaveBeenCalled();
  });

  it('allows marking a Rescheduled appointment as No Show too', async () => {
    const service = setup();
    service.appointmentRepo.findOne.mockResolvedValue({
      id: 'a2',
      status: AppointmentStatus.RESCHEDULED,
      ...YESTERDAY,
      client: null,
      business: { id: 'biz-1', businessName: 'Gold Salon' },
    });

    const result = await service.markNoShow('a2', { id: 'owner-1' });
    expect(result.status).toBe(AppointmentStatus.NO_SHOW);
  });

  it('refuses to mark a future appointment as a no-show', async () => {
    const service = setup();
    service.appointmentRepo.findOne.mockResolvedValue({
      id: 'a3',
      status: AppointmentStatus.CONFIRMED,
      ...FAR_FUTURE,
      client: null,
      business: { id: 'biz-1' },
    });

    await expect(service.markNoShow('a3', { id: 'owner-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.appointmentRepo.save).not.toHaveBeenCalled();
  });

  it.each([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW])(
    'refuses to re-mark an appointment that is already %s',
    async (status) => {
      const service = setup();
      service.appointmentRepo.findOne.mockResolvedValue({
        id: 'a4',
        status,
        ...YESTERDAY,
        client: null,
        business: { id: 'biz-1' },
      });

      await expect(service.markNoShow('a4', { id: 'owner-1' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('releases held Stripe escrow to the merchant, same as completing the booking', async () => {
    const service = setup();
    service.appointmentRepo.findOne.mockResolvedValue({
      id: 'a5',
      orderId: 'order-5',
      status: AppointmentStatus.CONFIRMED,
      ...YESTERDAY,
      client: null,
      business: { id: 'biz-1', ownerId: 'owner-1', businessName: 'Gold Salon' },
      staff: [],
    });
    service.walletService = {
      getWalletByBusinessId: jest.fn().mockResolvedValue({}),
      addFundsPending: jest.fn(),
    };
    service.staffCommissionEarningRepo = { save: jest.fn() };
    const heldIntent = {
      stripePaymentIntentId: 'pi_1',
      orderId: 'order-5',
      status: 'held',
      bookingAmount: 100,
      acquisitionFeeAmount: 5,
      commissionFeeAmount: 5,
      userId: 'customer-1',
    };
    service.stripePaymentIntentRepo.find.mockResolvedValue([heldIntent]);

    await service.markNoShow('a5', { id: 'owner-1' });

    expect(service.walletService.addFundsPending).toHaveBeenCalled();
    expect(heldIntent.status).toBe('released');
  });
});
