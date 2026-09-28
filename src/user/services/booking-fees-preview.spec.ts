import { BookingService } from './booking.service';

// getBookingFees is the read-only preview the frontend calls before a
// customer confirms a cancellation, so it must expose the exact same
// earlyCancellationFee cancelBooking itself would charge -- not just the
// cancellation window.

function build(opts: { getPaymentsResult?: any; business?: any } = {}) {
  const noop: any = {};
  const businessRepository = {
    findOne: jest.fn().mockResolvedValue(
      opts.business ?? {
        id: 'biz-1',
        ownerSettings: {},
        bookingPolicies: null,
      },
    ),
  };
  const platformSettingsService = {
    getPayments: jest.fn().mockResolvedValue(
      opts.getPaymentsResult ?? {
        commissionRate: 12,
        stripePassthroughRate: 1.75,
        stripePassthroughFixedFee: 0.3,
      },
    ),
  };

  const service = new BookingService(
    noop,
    businessRepository as any,
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
    platformSettingsService as any,
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
  );

  return { service, businessRepository, platformSettingsService };
}

describe('getBookingFees', () => {
  it('falls back to the default early-cancellation fee when platform settings has none set', async () => {
    const { service } = build();
    const result = await service.getBookingFees(undefined, undefined);
    expect(result.earlyCancellationFee).toBe(10);
  });

  it('uses the configured early-cancellation fee, no businessId', async () => {
    const { service } = build({ getPaymentsResult: { earlyCancellationFee: 25 } });
    const result = await service.getBookingFees(undefined, undefined);
    expect(result.earlyCancellationFee).toBe(25);
  });

  it('still includes earlyCancellationFee alongside the cancellation window when a businessId is given', async () => {
    const { service } = build({ getPaymentsResult: { earlyCancellationFee: 15 } });
    const result = await service.getBookingFees('biz-1', undefined);
    expect(result.earlyCancellationFee).toBe(15);
    expect(result).toHaveProperty('cancellationWindowHours');
  });
});
