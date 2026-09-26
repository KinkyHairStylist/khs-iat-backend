jest.mock('../config/redis', () => ({ getConnectedRedis: jest.fn() }));
jest.mock('../config/slack', () => ({ getSlackClient: jest.fn() }));

import { formatStandardNotification } from './slack-helpers';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from './enum';

const alert = {
  node: SlackNode.USER_MANAGEMENT,
  provider: SlackProvider.SYSTEM,
  severity: SlackSeverity.INFO,
  type: SlackEventType.USER_REGISTRATION,
  trigger: 'Ada Lovelace',
  body: 'New customer signed up',
};

describe('formatStandardNotification LOC', () => {
  const saved = { front: process.env.FRONTEND_URL, next: process.env.NEXTAUTH_URL };
  afterEach(() => {
    process.env.FRONTEND_URL = saved.front;
    process.env.NEXTAUTH_URL = saved.next;
    if (saved.front === undefined) delete process.env.FRONTEND_URL;
    if (saved.next === undefined) delete process.env.NEXTAUTH_URL;
  });

  it("shows this environment's public URL, not localhost", () => {
    process.env.FRONTEND_URL = 'https://iat.kinkyhairstylists.com/';
    delete process.env.NEXTAUTH_URL;

    expect(formatStandardNotification(alert)).toContain('*LOC:* `https://iat.kinkyhairstylists.com`');
  });

  it('still says localhost in local development', () => {
    process.env.FRONTEND_URL = 'http://localhost:3000';
    delete process.env.NEXTAUTH_URL;

    expect(formatStandardNotification(alert)).toContain('*LOC:* `localhost`');
  });

  it('lets a caller override the host', () => {
    process.env.FRONTEND_URL = 'https://iat.kinkyhairstylists.com';

    expect(formatStandardNotification({ ...alert, host: 'sit.kinkyhairstylists.com' })).toContain(
      '*LOC:* `https://sit.kinkyhairstylists.com`',
    );
  });
});
