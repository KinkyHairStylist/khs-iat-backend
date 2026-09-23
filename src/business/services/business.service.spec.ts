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

    // Positional constructor args -- the real param list has grown several
    // repos inserted ahead of businessRepo/staffRepo since this test was
    // last touched (stripePaymentIntentRepo, bookingDayRepo,
    // blockedSlotRepo all now come first), which had silently shifted both
    // mocks into the wrong slots: businessRepo's mock was landing in
    // blockedSlotRepo's position and staffRepo's in userRepo's, leaving
    // the real businessRepo/staffRepo positions as blank {} objects --
    // exactly why `this.staffRepo.findOne` wasn't a function. Indices
    // below match the current constructor order exactly (confirmed by
    // reading it): stripePaymentIntentRepo, bookingDayRepo,
    // blockedSlotRepo, businessRepo, appointmentRepo, userRepo, staffRepo,
    // staffCommissionEarningRepo, serviceRepo, advertisementPlanRepo,
    // passwordUtil, emergencyRepo, addressRepo, reviewRepo,
    // clientSchemaRepo, googleCalendarService, mailchimpService,
    // emailService, templateService, walletService,
    // businessOwnerSettingsService, zohoBooksService, notificationService,
    // merchantSignupService.
    service = new BusinessService(
      {} as any, // stripePaymentIntentRepo
      {} as any, // bookingDayRepo
      {} as any, // blockedSlotRepo
      businessRepo as any, // businessRepo
      {} as any, // appointmentRepo
      {} as any, // userRepo
      staffRepo as any, // staffRepo
      {} as any, // staffCommissionEarningRepo
      {} as any, // serviceRepo
      {} as any, // advertisementPlanRepo
      {} as any, // passwordUtil
      {} as any, // emergencyRepo
      {} as any, // addressRepo
      {} as any, // reviewRepo
      {} as any, // clientSchemaRepo
      {} as any, // googleCalendarService
      {} as any, // mailchimpService
      {} as any, // emailService
      {} as any, // templateService
      {} as any, // walletService
      {} as any, // businessOwnerSettingsService
      {} as any, // zohoBooksService
      {} as any, // notificationService
      {} as any, // merchantSignupService
    );
  });

  // Looks the caller up by id now (matching req.user.id/sub elsewhere in
  // this codebase), not by email -- confirmed by reading the current
  // implementation.
  it('falls back to a directly owned business when no staff link exists', async () => {
    const ownedBusiness = { id: 'business-1' } as Business;
    staffRepo.findOne.mockResolvedValue(null);
    businessRepo.findOne.mockResolvedValue(ownedBusiness);

    const result = await service.getBusinessFromStaff('user-123');

    expect(result).toBe(ownedBusiness);
    expect(staffRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      relations: ['business', 'business.serviceList'],
    });
    expect(businessRepo.findOne).toHaveBeenCalledWith({
      where: { owner: { id: 'user-123' } },
      relations: ['serviceList'],
    });
  });
});
