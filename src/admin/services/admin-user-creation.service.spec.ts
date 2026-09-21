import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminRole } from 'src/middleware/admin-role.enum';
import { AdminUserCreationService } from './admin-user-creation.service';

jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));
jest.mock('src/helpers/password-hashing.helper', () => ({
  PasswordHashingHelper: { hashPassword: jest.fn(async (p: string) => `hashed:${p.length}`) },
}));

const businessDto = (option: string = 'trial') =>
  ({
    businessName: 'Da Liv',
    primaryAudience: 'women',
    businessAddress: '1 Test St',
    companySize: 'solo',
    services: [],
    bookingHours: [],
    bookingPolicies: {},
    howDidYouHear: [],
    signup: { option },
  }) as any;

const baseDto = (persona: string, extra: Record<string, any> = {}) =>
  ({
    persona,
    email: ' Jane@Example.com ',
    firstName: 'Jane',
    surname: 'Doe',
    phoneNumber: ' +61400000000 ',
    ...extra,
  }) as any;

describe('AdminUserCreationService', () => {
  let usersRepo: any;
  let businessService: { create: jest.Mock };
  let adminService: { approveApplication: jest.Mock };
  let emailService: { sendAccountCreatedByAdminEmail: jest.Mock };
  let referral: { ensureReferralCode: jest.Mock };
  let existingByEmail: any;
  let existingByPhone: any;
  let service: AdminUserCreationService;

  beforeEach(() => {
    existingByEmail = null;
    existingByPhone = null;
    usersRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: () => ({ getOne: async () => existingByEmail }),
      })),
      findOne: jest.fn(async ({ where }: any) => (where.phoneNumber ? existingByPhone : usersRepo.found)),
      create: jest.fn((v: any) => ({ id: 'u-1', ...v })),
      save: jest.fn(async (v: any) => v),
      delete: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      found: null,
    };
    businessService = { create: jest.fn().mockResolvedValue({ id: 'b-1', businessName: 'Da Liv', planTier: 'Starter' }) };
    adminService = { approveApplication: jest.fn().mockResolvedValue({}) };
    emailService = { sendAccountCreatedByAdminEmail: jest.fn().mockResolvedValue({}) };
    referral = { ensureReferralCode: jest.fn().mockResolvedValue('REF') };
    service = new AdminUserCreationService(
      usersRepo,
      {} as any,
      businessService as any,
      adminService as any,
      emailService as any,
      referral as any,
    );
  });

  describe('createUser', () => {
    it('creates a verified customer with the customer flags and a referral code', async () => {
      const result = await service.createUser(baseDto('CUSTOMER'), 'admin@khs.test');
      const saved = usersRepo.create.mock.calls[0][0];
      expect(saved).toMatchObject({
        email: 'jane@example.com',
        phoneNumber: '+61400000000',
        isVerified: true,
        isCustomer: true,
        isMerchant: false,
        isStaff: false,
        adminRole: null,
      });
      expect(saved.password).toMatch(/^hashed:/);
      expect(referral.ensureReferralCode).toHaveBeenCalledWith('u-1');
      expect(businessService.create).not.toHaveBeenCalled();
      expect(result.user.persona).toBe('Customer');
      expect(emailService.sendAccountCreatedByAdminEmail).toHaveBeenCalledWith(
        'jane@example.com',
        expect.objectContaining({ actionLabel: 'Sign in', path: '/auth' }),
      );
    });

    it('creates an admin who gets a set-password link that works for a week', async () => {
      await service.createUser(baseDto('ADMIN'));
      const saved = usersRepo.create.mock.calls[0][0];
      expect(saved).toMatchObject({ isStaff: true, adminRole: AdminRole.ADMIN, isCustomer: false });
      const [, details] = emailService.sendAccountCreatedByAdminEmail.mock.calls[0];
      expect(details.actionLabel).toBe('Set your password');
      expect(details.path).toMatch(/^\/invites\/admin-reset-password\?token=[0-9a-f]{64}&email=jane%40example\.com$/);
      const withToken = usersRepo.save.mock.calls.map((c: any[]) => c[0]).find((u: any) => u.resetCode);
      expect(withToken.resetCodeExpires.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
    });

    it('creates a merchant, their business and approves it, without the under-review email', async () => {
      const result = await service.createUser(baseDto('MERCHANT', { business: businessDto('trial') }));
      expect(businessService.create).toHaveBeenCalledWith(
        expect.objectContaining({ businessName: 'Da Liv' }),
        expect.objectContaining({ id: 'u-1', isMerchant: true, isCustomer: false }),
        { sendUnderReviewEmail: false },
      );
      expect(adminService.approveApplication).toHaveBeenCalledWith('b-1');
      expect(result).toMatchObject({ approved: true, businessId: 'b-1' });
    });

    it("refuses a paid start, since an admin can't pay for someone", async () => {
      await expect(
        service.createUser(baseDto('MERCHANT', { business: businessDto('paid') })),
      ).rejects.toThrow(/Trial or MVP/);
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('removes the account again if the business cannot be created', async () => {
      businessService.create.mockRejectedValue(new BadRequestException('MVP is closed.'));
      await expect(
        service.createUser(baseDto('MERCHANT', { business: businessDto('reveal') })),
      ).rejects.toThrow('MVP is closed.');
      expect(usersRepo.delete).toHaveBeenCalledWith('u-1');
      expect(emailService.sendAccountCreatedByAdminEmail).not.toHaveBeenCalled();
    });

    it('keeps the merchant but says so when approval fails', async () => {
      adminService.approveApplication.mockRejectedValue(new Error('db down'));
      const result = await service.createUser(baseDto('MERCHANT', { business: businessDto() }));
      expect(result.approved).toBe(false);
      expect(result.message).toMatch(/still needs approving/);
      expect(usersRepo.delete).not.toHaveBeenCalled();
    });

    it('refuses an email or phone number that is already registered', async () => {
      existingByEmail = { id: 'x' };
      await expect(service.createUser(baseDto('CUSTOMER'))).rejects.toBeInstanceOf(ConflictException);
      existingByEmail = null;
      existingByPhone = { id: 'y' };
      await expect(service.createUser(baseDto('CUSTOMER'))).rejects.toThrow(/phone number/);
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('still creates the account when the email fails to send', async () => {
      emailService.sendAccountCreatedByAdminEmail.mockRejectedValue(new Error('sendgrid'));
      await expect(service.createUser(baseDto('CUSTOMER'))).resolves.toMatchObject({
        user: { persona: 'Customer' },
      });
    });
  });

  describe('makeMerchant', () => {
    const customer = () => ({
      id: 'u-2',
      firstName: 'Sam',
      email: 'sam@example.com',
      isMerchant: false,
      isCustomer: true,
      isStaff: false,
      adminRole: null,
    });

    it('sets up the business for an existing customer and approves it', async () => {
      usersRepo.found = customer();
      const result = await service.makeMerchant('u-2', businessDto(), { id: 'admin-1' });
      expect(businessService.create).toHaveBeenCalled();
      expect(adminService.approveApplication).toHaveBeenCalledWith('b-1');
      expect(result).toMatchObject({ approved: true, user: { persona: 'Merchant' } });
    });

    it('takes admin access away from an admin who becomes a merchant', async () => {
      usersRepo.found = { ...customer(), isStaff: true, adminRole: AdminRole.ADMIN, isCustomer: false };
      await service.makeMerchant('u-2', businessDto(), { id: 'admin-1' });
      expect(businessService.create.mock.calls[0][1].adminRole).toBeNull();
    });

    it('puts the original flags back if the business fails', async () => {
      usersRepo.found = customer();
      businessService.create.mockRejectedValue(new Error('boom'));
      await expect(service.makeMerchant('u-2', businessDto(), { id: 'admin-1' })).rejects.toThrow('boom');
      expect(usersRepo.update).toHaveBeenCalledWith('u-2', {
        isMerchant: false,
        isCustomer: true,
        isStaff: false,
        adminRole: null,
      });
    });

    it("won't change your own persona, a super admin, or someone who is already a merchant", async () => {
      await expect(service.makeMerchant('admin-1', businessDto(), { id: 'admin-1' })).rejects.toThrow(/own persona/);
      usersRepo.found = { ...customer(), adminRole: AdminRole.SUPER_ADMIN };
      await expect(service.makeMerchant('u-2', businessDto(), { id: 'admin-1' })).rejects.toThrow(/super admin/);
      usersRepo.found = { ...customer(), isMerchant: true };
      await expect(service.makeMerchant('u-2', businessDto(), { id: 'admin-1' })).rejects.toThrow(/already a merchant/);
      usersRepo.found = null;
      await expect(service.makeMerchant('u-2', businessDto(), { id: 'admin-1' })).rejects.toBeInstanceOf(NotFoundException);
      expect(businessService.create).not.toHaveBeenCalled();
    });

    it('needs a Trial or MVP start', async () => {
      usersRepo.found = customer();
      await expect(service.makeMerchant('u-2', businessDto('paid'), { id: 'admin-1' })).rejects.toThrow(/Trial or MVP/);
    });
  });
});
