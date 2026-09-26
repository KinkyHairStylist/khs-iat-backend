import { getSlackChannelId, slackEnvPrefix, slackLocationHost } from './slack-target';

describe('getSlackChannelId', () => {
  it('returns the configured channel', () => {
    expect(getSlackChannelId('C123ABC')).toBe('C123ABC');
  });

  it('trims whitespace from the configured channel', () => {
    expect(getSlackChannelId('  C123ABC \n')).toBe('C123ABC');
  });

  it('returns undefined when nothing is configured, never a fallback channel', () => {
    expect(getSlackChannelId(undefined)).toBeUndefined();
    expect(getSlackChannelId('')).toBeUndefined();
    expect(getSlackChannelId('   ')).toBeUndefined();
  });
});

describe('slackEnvPrefix', () => {
  it('labels alerts with the upper-cased environment', () => {
    expect(slackEnvPrefix('uat')).toBe('[UAT] ');
    expect(slackEnvPrefix(' sit ')).toBe('[SIT] ');
  });

  it('adds no prefix when APP_ENV is unset or blank', () => {
    expect(slackEnvPrefix(undefined)).toBe('');
    expect(slackEnvPrefix('  ')).toBe('');
  });
});

describe('slackLocationHost', () => {
  it('prefers an explicit host', () => {
    expect(slackLocationHost('https://x.test', 'https://iat.test', 'https://old.test')).toBe('https://x.test');
  });

  it("uses this deployment's FRONTEND_URL when no host is given", () => {
    expect(slackLocationHost(undefined, 'https://iat.kinkyhairstylists.com', 'https://old.test')).toBe(
      'https://iat.kinkyhairstylists.com',
    );
  });

  it('falls back to the legacy NEXTAUTH_URL, then localhost', () => {
    expect(slackLocationHost(undefined, undefined, 'https://old.test')).toBe('https://old.test');
    expect(slackLocationHost(undefined, '  ', '')).toBe('localhost');
  });
});
