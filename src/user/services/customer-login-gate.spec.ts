import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserService } from './user.service';

jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));
jest.mock('../../services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));
jest.mock('../../helpers/password-hashing.helper', () => ({
  PasswordHashingHelper: { comparePassword: jest.fn(async (plain: string) => plain === 'right-password') },
}));
jest.mock('../../helpers/token.helper', () => ({
  getTokens: jest.fn(async () => ({ accessToken: 'access', refreshToken: 'refresh' })),
}));

// login and refreshTokens only use a few collaborators, so they run on a bare object.
describe('customer sign-in is for customer accounts', () => {
  const proto: any = UserService.prototype;
  let user: any;
  let ctx: any;

  const account = (over: Record<string, any> = {}) => ({
    id: 'u-1',
    email: 'a@b.com',
    password: 'hashed',
    firstName: 'Ann',
    isVerified: true,
    isCustomer: true,
    isMerchant: false,
    isStaff: false,
    isBusinessStaff: false,
    ...over,
  });

  beforeEach(() => {
    user = account();
    ctx = {
      userRepository: { findOne: jest.fn(async () => user), save: jest.fn(async (u: any) => u) },
      jwtService: { verifyAsync: jest.fn(async () => ({ sub: 'u-1' })) },
      emailService: { sendLoginNotificationEmail: jest.fn() },
      sanitizeUser: (u: any) => u,
      assertCustomerAccount: proto.assertCustomerAccount,
    };
  });

  const login = (password = 'right-password') => proto.login.call(ctx, { email: 'a@b.com', password });
  const refresh = () => proto.refreshTokens.call(ctx, 'some-refresh-token');

  describe('login', () => {
    it('lets a customer in', async () => {
      await expect(login()).resolves.toMatchObject({ success: true, token: 'access' });
    });

    it('turns a merchant away and says where to go, without issuing a session', async () => {
      user = account({ isCustomer: false, isMerchant: true });
      await expect(login()).rejects.toBeInstanceOf(ForbiddenException);
      await expect(login()).rejects.toThrow(/merchant account/);
      expect(ctx.emailService.sendLoginNotificationEmail).not.toHaveBeenCalled();
      expect(ctx.userRepository.save).not.toHaveBeenCalled();
    });

    it('turns an admin and a salon staff member away', async () => {
      user = account({ isCustomer: false, isStaff: true });
      await expect(login()).rejects.toThrow(/admin account/);
      user = account({ isCustomer: false, isBusinessStaff: true });
      await expect(login()).rejects.toThrow(/merchant account/);
    });

    it('still lets in an account that is a merchant and a customer', async () => {
      user = account({ isCustomer: true, isMerchant: true });
      await expect(login()).resolves.toMatchObject({ success: true });
    });

    it("doesn't lock out an account that is none of the other types", async () => {
      user = account({ isCustomer: false });
      await expect(login()).resolves.toMatchObject({ success: true });
    });

    it("checks the password first, so a wrong one never reveals what type of account it is", async () => {
      user = account({ isCustomer: false, isMerchant: true });
      await expect(login('wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(login('wrong-password')).rejects.toThrow('Invalid email or password');
    });
  });

  describe('refreshTokens', () => {
    it('renews a customer session', async () => {
      await expect(refresh()).resolves.toMatchObject({ success: true, token: 'access' });
    });

    it('ends a session held by an account that is not a customer', async () => {
      user = account({ isCustomer: false, isMerchant: true });
      await expect(refresh()).rejects.toThrow('Invalid or expired refresh token');
    });
  });
});
