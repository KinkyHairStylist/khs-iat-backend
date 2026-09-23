import { InventoryService } from './inventory.service';

// getCategoriesList is called from a merchant's own Inventory dashboard, so
// the counts it returns must be scoped to that merchant's own products --
// not every active product on the whole platform.

function setup() {
  const service: any = Object.create(InventoryService.prototype);

  service.platformInventoryRepository = {
    findOne: jest.fn().mockResolvedValue({ categoriesList: ['hair-care', 'extensions'] }),
  };

  // Simulates real product rows: 2 "hair-care" products belong to MY_BUSINESS,
  // 40 more "hair-care" products belong to OTHER_BUSINESS. A scoped query
  // (WHERE product.businessId = :businessId) would only ever see the 2 that
  // are mine; an unscoped one would return all 42 combined.
  const rows = [
    ...Array(2).fill({ businessId: 'MY_BUSINESS', category: 'hair-care' }),
    ...Array(40).fill({ businessId: 'OTHER_BUSINESS', category: 'hair-care' }),
  ];

  const makeQueryBuilder = () => {
    let businessFilter: string | null = null;
    const qb: any = {
      select: () => qb,
      addSelect: () => qb,
      where: () => qb,
      groupBy: () => qb,
      andWhere: (clause: string, params?: any) => {
        if (clause.includes('businessId')) businessFilter = params.businessId;
        if (clause === '1 = 0') businessFilter = '__nothing__';
        return qb;
      },
      getRawMany: async () => {
        const matching = rows.filter((r) => businessFilter === null || r.businessId === businessFilter);
        if (businessFilter === '__nothing__') return [];
        const counts = new Map<string, number>();
        for (const r of matching) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
        return [...counts.entries()].map(([category, count]) => ({ category, count }));
      },
    };
    return qb;
  };

  service.productRepository = { createQueryBuilder: () => makeQueryBuilder() };
  service.businessRepository = {
    findOne: jest.fn(async ({ where }: any) =>
      where.ownerId === 'owner-1' ? { id: 'MY_BUSINESS' } : null,
    ),
  };

  return service;
}

describe('getCategoriesList', () => {
  it('scopes category counts to the requesting merchant\'s own products', async () => {
    const service = setup();
    const result = await service.getCategoriesList('owner-1');

    const hairCare = result.categories.find((c: any) => c.value === 'hair-care');
    expect(hairCare.count).toBe(2); // not 42

    const all = result.categories.find((c: any) => c.value === 'all');
    expect(all.count).toBe(2);
  });

  it('returns zero counts for a user with no business, rather than leaking platform-wide totals', async () => {
    const service = setup();
    const result = await service.getCategoriesList('someone-with-no-business');

    const hairCare = result.categories.find((c: any) => c.value === 'hair-care');
    expect(hairCare.count).toBe(0);
  });

  it('falls back to platform-wide counts when called with no ownerId (e.g. a future admin view)', async () => {
    const service = setup();
    const result = await service.getCategoriesList();

    const hairCare = result.categories.find((c: any) => c.value === 'hair-care');
    expect(hairCare.count).toBe(42);
  });
});
