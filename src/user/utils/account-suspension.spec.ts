import { UnauthorizedException } from '@nestjs/common';
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
