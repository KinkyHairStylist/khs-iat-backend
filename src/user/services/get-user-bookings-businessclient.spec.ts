import { BookingService } from './booking.service';

// getUserBookings needs to surface a booking a merchant created directly
// against a Client Management record (businessClient), for a customer who
// is that same real person by email, even though no `client` was ever set
// on it (see BusinessService.createBooking — it never sets `client` at
// all). Tested against the real query-builder call this method makes,
// since that's where the bug lived (a plain `.find({ where: { client:
// { id } } })` before this fix, missing businessClient entirely).

function setup() {
  const matchingAppointment: any = {
    id: 'a1',
    orderId: 'BKID-1',
    client: null,
    businessClient: { email: 'real.customer@example.com' },
  };

  // Covers both query-builder chains this method drives: the stale-PENDING
  // expiry sweep (update/set/andWhere/execute) that runs first, and the
  // actual booking lookup (leftJoinAndSelect/where/orWhere/getMany).
  const queryBuilder: any = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn(function (this: any, clause: string, params: any) {
      // Simulate the actual SQL semantics closely enough to prove the
      // fix: the OR clause is what should surface the businessClient match.
      expect(clause).toContain('businessClient.email');
      expect(params.userEmail).toBe('real.customer@example.com');
      return this;
    }),
    getMany: jest.fn().mockResolvedValue([matchingAppointment]),
  };

  const bookingRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };

  const userRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 'cust-9', email: 'Real.Customer@Example.com' }),
  };

  const noop: any = {};
  const service = new BookingService(
    bookingRepository as any,
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
    userRepository as any,
    noop,
    { getReviewedOrderIds: jest.fn().mockResolvedValue(new Set()) } as any,
    noop, noop, noop, noop, noop, noop, noop, noop, noop, noop, noop,
  );
  return { service, queryBuilder, bookingRepository };
}

describe('getUserBookings', () => {
  it("includes a merchant-created booking matched by the user's email, via an OR clause on businessClient", async () => {
    const { service, queryBuilder } = setup();

    const result = await service.getUserBookings('cust-9');

    expect(queryBuilder.orWhere).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a1');
  });
});
