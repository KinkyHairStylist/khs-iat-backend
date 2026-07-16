import { SalonService } from './salon.service';

describe('SalonService', () => {
  it('filters salons by booking hours when date and time are provided', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const businessRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as any;

    const serviceRepo = {
      find: jest.fn().mockResolvedValue([]),
    } as any;

    const service = new SalonService(businessRepo, serviceRepo);

    await service.findAll({ date: '2026-07-14', time: '14:30' });

    const conditions = queryBuilder.andWhere.mock.calls.map(([sql]) => sql);

    expect(conditions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bookingHours.day = :day'),
        expect.stringContaining('bookingHours.isOpen = :isOpen'),
        expect.stringContaining('bookingHours.startTime <= :time'),
        expect.stringContaining('bookingHours.endTime >= :time'),
      ]),
    );
  });
});
