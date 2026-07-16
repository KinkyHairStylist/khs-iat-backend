jest.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: {
    setApiKey: jest.fn(),
    send: jest.fn(),
  },
}));

import { BusinessService } from './business.service';
import { Business } from '../entities/business.entity';

describe('BusinessService.getBusinessFromStaff', () => {
  let service: BusinessService;
  let staffRepo: { findOne: jest.Mock };
  let businessRepo: { findOne: jest.Mock };

  beforeEach(() => {
    staffRepo = { findOne: jest.fn() };
    businessRepo = { findOne: jest.fn() };

    service = new BusinessService(
      {} as any,
      {} as any,
      businessRepo as any,
      {} as any,
      {} as any,
      staffRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('falls back to a directly owned business when no staff link exists', async () => {
    const ownedBusiness = { id: 'business-1' } as Business;
    staffRepo.findOne.mockResolvedValue(null);
    businessRepo.findOne.mockResolvedValue(ownedBusiness);

    const result = await service.getBusinessFromStaff('owner@example.com');

    expect(result).toBe(ownedBusiness);
    expect(staffRepo.findOne).toHaveBeenCalledWith({
      where: { email: 'owner@example.com' },
      relations: ['business', 'business.serviceList'],
    });
    expect(businessRepo.findOne).toHaveBeenCalledWith({
      where: { ownerEmail: 'owner@example.com' },
      relations: ['serviceList'],
    });
  });
});
