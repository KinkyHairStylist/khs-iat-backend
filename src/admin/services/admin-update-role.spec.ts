import { BadRequestException } from '@nestjs/common';
import { AdminRole } from 'src/middleware/admin-role.enum';
import { BusinessStatus } from 'src/business/entities/business.entity';
import { AdminService } from './admin.service';

jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));

// updateUserRole only touches the two repositories, so it is exercised on a bare object.
describe('AdminService.updateUserRole (persona changes)', () => {
  let userRepo: { findOne: jest.Mock; save: jest.Mock };
  let businessRepo: { find: jest.Mock };
  let ctx: any;

  const run = (id: string, role: any, actor?: string) =>
    (AdminService.prototype.updateUserRole as any).call(ctx, id, role, actor);

  const user = (over: Record<string, any> = {}) => ({
    id: 'u-1',
    email: 'a@b.com',
    firstName: 'Ann',
    isStaff: false,
    isMerchant: false,
    isCustomer: true,
    adminRole: null,
    ...over,
  });

  beforeEach(() => {
    userRepo = { findOne: jest.fn(), save: jest.fn(async (u: any) => u) };
    businessRepo = { find: jest.fn().mockResolvedValue([]) };
    ctx = { userRepo, businessRepo };
  });

  it('makes a customer an admin, and an admin a customer', async () => {
    userRepo.findOne.mockResolvedValue(user());
    const toAdmin = await run('u-1', 'ADMIN', 'someone-else');
    expect(toAdmin.user).toMatchObject({ isStaff: true, isCustomer: false, isMerchant: false, persona: 'Admin' });

    userRepo.findOne.mockResolvedValue(user({ isStaff: true, isCustomer: false, adminRole: AdminRole.ADMIN }));
    const toCustomer = await run('u-1', 'CUSTOMER', 'someone-else');
    expect(toCustomer.user).toMatchObject({ isStaff: false, isCustomer: true, persona: 'Customer' });
  });

  it("won't change your own persona or a super admin's", async () => {
    userRepo.findOne.mockResolvedValue(user());
    await expect(run('u-1', 'ADMIN', 'u-1')).rejects.toThrow(/own persona/);

    userRepo.findOne.mockResolvedValue(user({ isStaff: true, adminRole: AdminRole.SUPER_ADMIN }));
    await expect(run('u-1', 'CUSTOMER', 'someone-else')).rejects.toThrow(/super admin/);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('blocks a merchant who still owns a business', async () => {
    userRepo.findOne.mockResolvedValue(user({ isMerchant: true, isCustomer: false }));
    businessRepo.find.mockResolvedValue([{ id: 'b', businessName: 'Da Liv', status: BusinessStatus.APPROVED }]);
    await expect(run('u-1', 'CUSTOMER', 'someone-else')).rejects.toBeInstanceOf(BadRequestException);
    await expect(run('u-1', 'CUSTOMER', 'someone-else')).rejects.toThrow(/Da Liv/);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('lets a merchant switch when they have no business, or only a rejected one', async () => {
    userRepo.findOne.mockResolvedValue(user({ isMerchant: true, isCustomer: false }));
    businessRepo.find.mockResolvedValue([{ id: 'b', businessName: 'Old', status: BusinessStatus.REJECTED }]);
    const result = await run('u-1', 'CUSTOMER', 'someone-else');
    expect(result.user).toMatchObject({ isMerchant: false, isCustomer: true, persona: 'Customer' });
  });
});
