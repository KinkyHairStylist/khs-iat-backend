import { BookingService } from './booking.service';
import { ClientType } from 'src/business/entities/client.entity';

// A client rates a completed booking: the overall service (Review.rating)
// and, separately, the staff member who performed it (Review.staffRating)
// — distinct fields, since a client may love the salon but not that day's
// stylist, or vice versa. staffRating only makes sense when a staff member
// was actually assigned; "any stylist" left unfilled has nobody to rate.

function setup(assignedStaffId: string | null) {
  const service: any = Object.create(BookingService.prototype);

  const appointment = {
    orderId: 'ORD-1',
    serviceName: 'Silk Press',
    business: {
      id: 'biz-1',
      owner: { id: 'owner-1' },
    },
    staff: assignedStaffId ? [{ id: assignedStaffId }] : [],
  };

  service.bookingRepository = {
    findOne: jest.fn().mockResolvedValue(appointment),
  };
  service.clientRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'client-1' }),
    save: jest.fn(),
  };
  service.reviewService = {
    createReview: jest.fn().mockResolvedValue({ success: true }),
  };

  const user = { id: 'user-1', email: 'a@b.test', firstName: 'Ada', surname: 'Obi' } as any;
  return { service, user };
}

describe('rateBusiness — staff rating', () => {
  it('stores a separate staffRating when the booking had an assigned staff member', async () => {
    const { service, user } = setup('staff-1');

    await service.rateBusiness('ORD-1', 5, 'Loved it', user, 4);

    expect(service.reviewService.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'staff-1', rating: 5, staffRating: 4 }),
    );
  });

  it('never records a staffRating when nobody was assigned, even if the client sent one', async () => {
    const { service, user } = setup(null);

    // A crafted/stale client request sending staffRating for a booking
    // that never had staff assigned — nothing to attribute it to.
    await service.rateBusiness('ORD-1', 5, 'Loved it', user, 4);

    expect(service.reviewService.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: null, staffRating: null }),
    );
  });

  it('leaves staffRating null when the client only rated the service', async () => {
    const { service, user } = setup('staff-1');

    await service.rateBusiness('ORD-1', 5, 'Loved it', user);

    expect(service.reviewService.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'staff-1', staffRating: null }),
    );
  });
});
