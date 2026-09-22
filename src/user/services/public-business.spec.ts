import { toPublicBusiness, toPublicService } from './public-business';

describe('public salon pages hide a salon\'s internal figures', () => {
  const business = { id: 'b1', businessName: 'Da Liv', revenueGoal: 10000, revenue: 4200, ownerName: 'Ada' };

  it('removes the revenue goal and revenue from a salon', () => {
    const result = toPublicBusiness(business);
    expect(result).not.toHaveProperty('revenueGoal');
    expect(result).not.toHaveProperty('revenue');
    expect(result).toMatchObject({ id: 'b1', businessName: 'Da Liv', ownerName: 'Ada' });
  });

  it('removes them from the salon attached to a service', () => {
    const result = toPublicService({ id: 's1', name: 'Braids', business });
    expect(JSON.stringify(result)).not.toContain('revenueGoal');
    expect(result).toMatchObject({ id: 's1', name: 'Braids', business: { businessName: 'Da Liv' } });
  });

  it('removes them from the salons inside a salon\'s service list', () => {
    const result = toPublicBusiness({ ...business, serviceList: [{ id: 's1', business }] });
    expect(JSON.stringify(result)).not.toContain('revenueGoal');
    expect(result.serviceList).toHaveLength(1);
  });

  it('does not change the salon it was given', () => {
    toPublicBusiness(business);
    expect(business.revenueGoal).toBe(10000);
  });

  it('copes with a service that has no salon attached', () => {
    expect(toPublicService({ id: 's1' })).toEqual({ id: 's1' });
  });
});
