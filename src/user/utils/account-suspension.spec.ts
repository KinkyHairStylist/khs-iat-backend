import { UnauthorizedException } from '@nestjs/common';
import { AdminService } from 'src/admin/services/admin.service';
import { assertNotSuspended, SUSPENDED_MESSAGE } from './account-suspension';

jest.mock('src/services/slack.service', () => ({ SlackService: { notify: jest.fn() } }));

describe('suspended accounts', () => {
  it('are turned away with a message they can act on', () => {
    expect(() => assertNotSuspended({ isSuspended: true })).toThrow(UnauthorizedException);
    expect(() => assertNotSuspended({ isSuspended: true })).toThrow(SUSPENDED_MESSAGE);
  });

  it('do not stop anyone else', () => {
    expect(() => assertNotSuspended({ isSuspended: false })).not.toThrow();
    expect(() => assertNotSuspended({})).not.toThrow();
    expect(() => assertNotSuspended(null)).not.toThrow();
  });
});

describe('suspending and reactivating a user', () => {
  const build = (user: any) => {
    const service: any = Object.create(AdminService.prototype);
    service.findById = jest.fn().mockResolvedValue(user);
    service.userRepo = { save: jest.fn().mockImplementation(async (u) => u) };
    return service as AdminService & { userRepo: { save: jest.Mock } };
  };

  it('leaves an unverified account unverified when it is reactivated', async () => {
    const user = { id: 'u1', email: 'a@b.com', isSuspended: true, isVerified: false };
    await build(user).unsuspend('u1');
    expect(user.isSuspended).toBe(false);
    expect(user.isVerified).toBe(false);
  });

  it('keeps a verified account verified while it is suspended', async () => {
    const user = { id: 'u1', email: 'a@b.com', isSuspended: false, isVerified: true, suspensionHistory: '' };
    await build(user).suspend('u1', 'spam');
    expect(user.isSuspended).toBe(true);
    expect(user.isVerified).toBe(true);
  });

  it('keeps a verified account verified when it is reactivated', async () => {
    const user = { id: 'u1', email: 'a@b.com', isSuspended: true, isVerified: true };
    await build(user).unsuspend('u1');
    expect(user).toMatchObject({ isSuspended: false, isVerified: true });
  });
});
