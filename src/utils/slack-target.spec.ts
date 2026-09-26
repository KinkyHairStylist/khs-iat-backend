import { getSlackChannelId, slackEnvPrefix } from './slack-target';

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
