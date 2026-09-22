import { ForbiddenException } from '@nestjs/common';
import { assertCanManageBusiness } from './business-access';

describe('assertCanManageBusiness', () => {
  const salon = { ownerId: 'owner-1' };

  it('lets the owner manage their own business', () => {
    expect(() => assertCanManageBusiness({ id: 'owner-1' }, salon)).not.toThrow();
  });

  it('accepts the id from a token payload too', () => {
    expect(() => assertCanManageBusiness({ sub: 'owner-1' }, salon)).not.toThrow();
  });

  it("refuses another merchant's business", () => {
    expect(() => assertCanManageBusiness({ id: 'someone-else' }, salon)).toThrow(ForbiddenException);
  });

  it('lets a platform admin manage any business', () => {
    expect(() => assertCanManageBusiness({ id: 'admin-1', isStaff: true }, salon)).not.toThrow();
  });

  it('refuses when the business is missing or the caller is unknown', () => {
    expect(() => assertCanManageBusiness({ id: 'owner-1' }, null)).toThrow(ForbiddenException);
    expect(() => assertCanManageBusiness(undefined, salon)).toThrow(ForbiddenException);
  });
});
