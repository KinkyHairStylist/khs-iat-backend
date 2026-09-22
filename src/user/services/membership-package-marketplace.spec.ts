import { BusinessStatus } from 'src/business/entities/business.entity';
import { MembershipPackagePurchaseService } from './membership-package-purchase.service';

// These two methods only touch the repositories, so they run on a bare object.
describe('MembershipPackagePurchaseService: marketplace and owned memberships', () => {
  const owned = MembershipPackagePurchaseService.prototype.getOwnedPurchases;
  const marketplace = MembershipPackagePurchaseService.prototype.listMarketplace;

  describe('getOwnedPurchases', () => {
    it("adds the salon's name but never passes on the salon record", async () => {
      const purchaseRepo = {
        find: jest.fn().mockResolvedValue([
          {
            id: 'pur-1',
            clientId: 'me',
            remainingSessions: 3,
            package: {
              id: 'pkg-1',
              sessionCount: 5,
              service: { name: 'Braids' },
              business: { businessName: 'Da Liv', ownerEmail: 'owner@secret.com', revenueGoal: 999 },
            },
          },
        ]),
      };
      const result = await owned.call({ purchaseRepo }, 'me');

      expect(purchaseRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { clientId: 'me' } }),
      );
      expect(result[0]).toMatchObject({ businessName: 'Da Liv', remainingSessions: 3 });
      expect(JSON.stringify(result)).not.toContain('owner@secret.com');
      expect(JSON.stringify(result)).not.toContain('revenueGoal');
    });

    it('copes with a purchase whose package was removed', async () => {
      const purchaseRepo = { find: jest.fn().mockResolvedValue([{ id: 'pur-2', package: null }]) };
      const result = await owned.call({ purchaseRepo }, 'me');
      expect(result[0]).toMatchObject({ businessName: null, package: null });
    });
  });

  describe('listMarketplace', () => {
    const build = (rows: any[]) => {
      const qb: any = {};
      for (const m of ['innerJoinAndSelect', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'take']) {
        qb[m] = jest.fn(() => qb);
      }
      qb.getMany = jest.fn().mockResolvedValue(rows);
      return { qb, packageRepo: { createQueryBuilder: jest.fn(() => qb) } };
    };

    const row = {
      id: 'p1',
      businessId: 'b1',
      serviceId: 's1',
      pricePerSession: '40',
      sessionCount: 5,
      expiryDays: 365,
      business: { businessName: 'Da Liv', businessAddress: '1 Test St', ownerEmail: 'secret@x.com' },
      service: { name: 'Braids', price: '50' },
    };

    it('lists only active packages from approved salons, as light items', async () => {
      const { qb, packageRepo } = build([row]);
      const items = await marketplace.call({ packageRepo }, {});
      expect(qb.where).toHaveBeenCalledWith('p.isActive = :active', { active: true });
      expect(qb.andWhere).toHaveBeenCalledWith('b.status = :approved', { approved: BusinessStatus.APPROVED });
      expect(items[0]).toMatchObject({ businessName: 'Da Liv', serviceName: 'Braids', total: 200, saving: 50 });
      expect(JSON.stringify(items)).not.toContain('secret@x.com');
    });

    it('narrows to one salon and searches salon or service, matching wildcards literally', async () => {
      const { qb, packageRepo } = build([]);
      await marketplace.call({ packageRepo }, { businessId: 'b1', search: '  50% off ' });
      expect(qb.andWhere).toHaveBeenCalledWith('b.id = :businessId', { businessId: 'b1' });
      expect(qb.andWhere).toHaveBeenCalledWith('(b.businessName ILIKE :term OR s.name ILIKE :term)', {
        term: '%50\\% off%',
      });
    });

    it('adds no search condition for an empty search', async () => {
      const { qb, packageRepo } = build([]);
      await marketplace.call({ packageRepo }, { search: '   ' });
      const conditions = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
      expect(conditions.some((c: string) => c.includes('ILIKE'))).toBe(false);
    });
  });
});
