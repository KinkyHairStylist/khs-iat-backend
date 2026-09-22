import { escapeLike, toMarketplaceItem } from './membership-marketplace.helper';

const pkg = (over: Record<string, any> = {}) => ({
  id: 'p1',
  businessId: 'b1',
  serviceId: 's1',
  pricePerSession: '40.00',
  sessionCount: 5,
  expiryDays: 365,
  business: { businessName: 'Da Liv', businessAddress: '1 Test St' },
  service: { name: 'Braids', category: 'hair-services', price: '50.00' },
  ...over,
});

describe('membership marketplace helpers', () => {
  describe('toMarketplaceItem', () => {
    it('works out the total and what the customer saves against booking one by one', () => {
      expect(toMarketplaceItem(pkg())).toMatchObject({
        businessName: 'Da Liv',
        serviceName: 'Braids',
        pricePerSession: 40,
        total: 200,
        saving: 50, // 5 x $50 booked separately is $250
      });
    });

    it("shows no saving when it isn't cheaper, or when the service has no fixed price", () => {
      expect(toMarketplaceItem(pkg({ pricePerSession: 50 })).saving).toBe(0);
      expect(toMarketplaceItem(pkg({ pricePerSession: 60 })).saving).toBe(0);
      expect(toMarketplaceItem(pkg({ service: { name: 'Braids', price: null } })).saving).toBe(0);
    });

    it('never passes on anything but the fields a customer needs', () => {
      const item = toMarketplaceItem(
        pkg({ business: { businessName: 'Da Liv', businessAddress: 'x', ownerEmail: 'secret@x.com', revenueGoal: 9 } }),
      );
      expect(JSON.stringify(item)).not.toContain('secret@x.com');
      expect(Object.keys(item)).not.toContain('business');
    });

    it('copes with a missing salon or service', () => {
      expect(toMarketplaceItem(pkg({ business: null, service: null }))).toMatchObject({
        businessName: 'Salon',
        serviceName: 'Service',
        saving: 0,
      });
    });
  });

  describe('escapeLike', () => {
    it('makes wildcard characters match literally', () => {
      expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
      expect(escapeLike('braids')).toBe('braids');
    });
  });
});
