import {
  eventLocalTimes,
  mailchimpDataCentre,
  zohoDataCentreFromAccountsServer,
  zohoDataCentreOrDefault,
} from './integration.helpers';

// Built at runtime: a literal key-shaped string in the source trips GitHub's secret scanning.
const fakeKey = (dataCentre: string) => `${'0123456789abcdef'.repeat(2)}-${dataCentre}`;

describe('integration helpers', () => {
  describe('eventLocalTimes', () => {
    it('builds local start/end strings from stored wall-clock values', () => {
      expect(eventLocalTimes('2026-09-25', '2:00 PM', '1 hr 30 mins')).toEqual({
        start: '2026-09-25T14:00:00',
        end: '2026-09-25T15:30:00',
      });
    });

    it('does not shift the date whatever the server time zone is', () => {
      expect(eventLocalTimes('2026-01-01', '12:15 AM', '45 mins')).toEqual({
        start: '2026-01-01T00:15:00',
        end: '2026-01-01T01:00:00',
      });
    });

    it('rolls over midnight', () => {
      expect(eventLocalTimes('2026-09-25', '11:30 PM', '1 hr')).toEqual({
        start: '2026-09-25T23:30:00',
        end: '2026-09-26T00:30:00',
      });
    });

    it('returns null for an unusable date or time', () => {
      expect(eventLocalTimes('nope', '2:00 PM', '30 mins')).toBeNull();
      expect(eventLocalTimes('2026-09-25', 'later', '30 mins')).toBeNull();
    });
  });

  describe('mailchimpDataCentre', () => {
    it('reads the data centre from a valid key', () => {
      expect(mailchimpDataCentre(fakeKey('us21'))).toBe('us21');
      expect(mailchimpDataCentre(`  ${fakeKey('us6')}  `)).toBe('us6');
    });

    it('rejects anything that is not a Mailchimp key', () => {
      expect(mailchimpDataCentre('')).toBeNull();
      expect(mailchimpDataCentre('abc-us21')).toBeNull();
      expect(mailchimpDataCentre('0123456789abcdef'.repeat(2))).toBeNull();
      expect(mailchimpDataCentre(fakeKey('evil.com/x'))).toBeNull();
    });
  });

  describe('zoho data centres', () => {
    it('maps the accounts server Zoho reports to its region', () => {
      expect(zohoDataCentreFromAccountsServer('https://accounts.zoho.eu')).toBe('eu');
      expect(zohoDataCentreFromAccountsServer('https://accounts.zoho.in')).toBe('in');
      expect(zohoDataCentreFromAccountsServer('https://accounts.zoho.com.au')).toBe('com.au');
      expect(zohoDataCentreFromAccountsServer('https://accounts.zoho.com')).toBe('com');
    });

    it('falls back to .com for missing or unknown servers, so a crafted value cannot redirect the token exchange', () => {
      expect(zohoDataCentreFromAccountsServer(undefined)).toBe('com');
      expect(zohoDataCentreFromAccountsServer('not a url')).toBe('com');
      expect(zohoDataCentreFromAccountsServer('https://accounts.zoho.eu.evil.com')).toBe('com');
      expect(zohoDataCentreFromAccountsServer('https://evil.example')).toBe('com');
    });

    it('defaults a stored value that is not a known region', () => {
      expect(zohoDataCentreOrDefault('eu')).toBe('eu');
      expect(zohoDataCentreOrDefault('mars')).toBe('com');
      expect(zohoDataCentreOrDefault(null)).toBe('com');
    });
  });
});

describe('integrationRedirectUri', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const { integrationRedirectUri } = jest.requireActual('./integration.helpers');

  it('uses the explicit address when one is configured', () => {
    process.env.GOOGLE_REDIRECT_URI = 'https://app.example.com/custom';
    expect(integrationRedirectUri('google-calendar')).toBe('https://app.example.com/custom');
  });

  it('is built from FRONTEND_URL when no explicit address is set, so no environment is hardcoded', () => {
    delete process.env.GOOGLE_REDIRECT_URI;
    delete process.env.ZOHO_REDIRECT_URI;
    process.env.FRONTEND_URL = 'https://khs.example.com/';
    expect(integrationRedirectUri('google-calendar')).toBe(
      'https://khs.example.com/merchant/dashboard/settings?tab=integrations',
    );
    expect(integrationRedirectUri('zohobooks')).toBe(
      'https://khs.example.com/merchant/dashboard/settings?tab=integrations&type=zohobooks',
    );
  });

  it('returns null when nothing is configured', () => {
    delete process.env.GOOGLE_REDIRECT_URI;
    delete process.env.FRONTEND_URL;
    expect(integrationRedirectUri('google-calendar')).toBeNull();
  });
});
