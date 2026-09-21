import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BusinessStatus } from 'src/business/entities/business.entity';
import { AdminMerchantMembershipsService } from './admin-merchant-memberships.service';

jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));

const pkg = (over: Record<string, any> = {}) => ({
  id: 'pkg-1',
  businessId: 'biz-1',
  serviceId: 'svc-1',
  pricePerSession: '50.00',
  sessionCount: 5,
  expiryDays: 365,
  isActive: true,
  createdAt: new Date('2026-09-01'),
  business: { businessName: 'Da Liv' },
  service: { name: 'Braids' },
  ...over,
});

describe('AdminMerchantMembershipsService', () => {
  let packageRepo: { find: jest.Mock; findOne: jest.Mock };
  let purchaseRepo: { createQueryBuilder: jest.Mock; find: jest.Mock };
  let businessRepo: { findOne: jest.Mock; find: jest.Mock };
  let serviceRepo: { find: jest.Mock };
  let merchant: { create: jest.Mock; deactivate: jest.Mock };
  let statRows: any[];
  let service: AdminMerchantMembershipsService;

  beforeEach(() => {
    statRows = [];
    const qb: any = {};
    for (const m of ['select', 'addSelect', 'setParameters', 'groupBy']) qb[m] = jest.fn(() => qb);
    qb.getRawMany = jest.fn(async () => statRows);
    packageRepo = { find: jest.fn().mockResolvedValue([pkg()]), findOne: jest.fn() };
    purchaseRepo = { createQueryBuilder: jest.fn(() => qb), find: jest.fn().mockResolvedValue([]) };
    businessRepo = { findOne: jest.fn(), find: jest.fn() };
    serviceRepo = { find: jest.fn() };
    merchant = {
      create: jest.fn().mockResolvedValue({ id: 'new', sessionCount: 5, pricePerSession: 50 }),
      deactivate: jest.fn().mockResolvedValue({ id: 'pkg-1', isActive: false }),
    };
    service = new AdminMerchantMembershipsService(
      packageRepo as any,
      purchaseRepo as any,
      businessRepo as any,
      serviceRepo as any,
      merchant as any,
    );
  });

  describe('overview', () => {
    it('works out what a client pays and what has sold, per package and in total', async () => {
      statRows = [{ packageId: 'pkg-1', sold: '3', active: '2', fullyUsed: '1', expired: '0', sessionsLeft: '7' }];
      const result = await service.overview();
      expect(result.packages[0]).toMatchObject({
        businessName: 'Da Liv',
        serviceName: 'Braids',
        clientPays: 250,
        sold: 3,
        activeMemberships: 2,
        fullyUsed: 1,
        sessionsLeft: 7,
        soldValue: 750,
      });
      expect(result.summary).toEqual({
        packages: 1,
        activePackages: 1,
        salons: 1,
        sold: 3,
        activeMemberships: 2,
        sessionsLeft: 7,
        soldValue: 750,
      });
    });

    it('shows a package nobody has bought yet with zeros', async () => {
      const result = await service.overview();
      expect(result.packages[0]).toMatchObject({ sold: 0, soldValue: 0, sessionsLeft: 0 });
    });

    it('names purchases by client, salon and service', async () => {
      purchaseRepo.find.mockResolvedValue([
        {
          id: 'pur-1',
          client: { firstName: 'Ann', surname: 'Lee', email: 'ann@x.com' },
          package: pkg(),
          remainingSessions: 4,
          purchasedAt: new Date(),
          expiresAt: new Date(),
          status: 'ACTIVE',
        },
      ]);
      const result = await service.overview();
      expect(result.purchases[0]).toMatchObject({
        clientName: 'Ann Lee',
        businessName: 'Da Liv',
        serviceName: 'Braids',
        sessionCount: 5,
        remainingSessions: 4,
      });
    });
  });

  describe('create', () => {
    const dto = { businessId: 'biz-1', serviceId: 'svc-1', pricePerSession: 50, sessionCount: 5 } as any;

    it("creates it through the salon's own rules, for that salon", async () => {
      businessRepo.findOne.mockResolvedValue({ id: 'biz-1', businessName: 'Da Liv', status: BusinessStatus.APPROVED });
      await service.create(dto, 'admin@khs.test');
      expect(merchant.create).toHaveBeenCalledWith(
        { serviceId: 'svc-1', pricePerSession: 50, sessionCount: 5, expiryDays: undefined },
        'biz-1',
      );
    });

    it('refuses an unknown salon and one that is not approved', async () => {
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
      businessRepo.findOne.mockResolvedValue({ id: 'biz-1', status: BusinessStatus.PENDING });
      await expect(service.create(dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(merchant.create).not.toHaveBeenCalled();
    });

    it("passes on the salon's refusal when the service belongs to another salon", async () => {
      businessRepo.findOne.mockResolvedValue({ id: 'biz-1', businessName: 'Da Liv', status: BusinessStatus.APPROVED });
      merchant.create.mockRejectedValue(new BadRequestException('Service does not belong to this business'));
      await expect(service.create(dto)).rejects.toThrow(/does not belong/);
    });
  });

  describe('deactivate', () => {
    it("switches a package off using the package's own salon", async () => {
      packageRepo.findOne.mockResolvedValue(pkg());
      await service.deactivate('pkg-1', 'admin@khs.test');
      expect(merchant.deactivate).toHaveBeenCalledWith('pkg-1', 'biz-1');
    });

    it('does nothing for a package that is already off, and refuses an unknown one', async () => {
      packageRepo.findOne.mockResolvedValue(pkg({ isActive: false }));
      await service.deactivate('pkg-1');
      expect(merchant.deactivate).not.toHaveBeenCalled();
      packageRepo.findOne.mockResolvedValue(null);
      await expect(service.deactivate('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('salon and service pickers', () => {
    it('lists approved salons by name, and a salon\'s services with numeric prices', async () => {
      businessRepo.find.mockResolvedValue([{ id: 'b1', businessName: 'Da Liv' }]);
      expect(await service.listSalons()).toEqual([{ id: 'b1', name: 'Da Liv' }]);
      serviceRepo.find.mockResolvedValue([{ id: 's1', name: 'Braids', price: '80.00' }, { id: 's2', name: 'Lash', price: null }]);
      expect(await service.listServices('b1')).toEqual([
        { id: 's1', name: 'Braids', price: 80 },
        { id: 's2', name: 'Lash', price: null },
      ]);
    });
  });
});
