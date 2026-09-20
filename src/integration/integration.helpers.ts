import { parseDurationToMinutes, wallClockMs } from 'src/helpers/booking-rules.helper';

// Thrown by an integration service when the merchant's saved credentials no
// longer work (token revoked, key deleted, refresh failed). The sync layer
// reacts by marking the integration disconnected so the merchant sees it and
// can reconnect, instead of every booking failing quietly.
export class IntegrationAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationAuthError';
  }
}

// Where Google/Zoho send the merchant back after they authorise: the Integrations
// tab of the frontend. The full address comes from GOOGLE_REDIRECT_URI /
// ZOHO_REDIRECT_URI when set; otherwise it is built from FRONTEND_URL, so nothing
// about one environment is baked into the code. Whatever it resolves to must also
// be registered as an authorised redirect URI in the Google / Zoho console.
export function integrationRedirectUri(
  provider: 'google-calendar' | 'zohobooks',
): string | null {
  const explicit =
    provider === 'google-calendar'
      ? process.env.GOOGLE_REDIRECT_URI
      : process.env.ZOHO_REDIRECT_URI;
  if (explicit) return explicit;

  const base = (process.env.FRONTEND_URL ?? '').trim().replace(/[/]+$/, '');
  if (!base) return null;
  const path = '/merchant/dashboard/settings?tab=integrations';
  return provider === 'zohobooks' ? `${base}${path}&type=zohobooks` : `${base}${path}`;
}

// An appointment's stored date + time are wall-clock strings ("2026-09-25",
// "2:00 PM"). Google wants a local dateTime plus the calendar's own time zone,
// so this returns local strings with no offset: "2026-09-25T14:00:00".
export function eventLocalTimes(
  date: string,
  time: string,
  duration?: string | null,
): { start: string; end: string } | null {
  const startMs = wallClockMs(date, time);
  if (startMs === null) return null;
  const endMs = startMs + parseDurationToMinutes(duration) * 60_000;
  const local = (ms: number) => new Date(ms).toISOString().slice(0, 19);
  return { start: local(startMs), end: local(endMs) };
}

// A Mailchimp API key is 32 hex characters, a dash, then the data centre code
// that serves the account (for example "us21").
const MAILCHIMP_KEY = /^[0-9a-f]{32}-([a-z]{2,3}\d{1,2})$/i;

export function mailchimpDataCentre(apiKey: string): string | null {
  const match = MAILCHIMP_KEY.exec((apiKey ?? '').trim());
  return match ? match[1].toLowerCase() : null;
}

// Zoho runs separate regions; a merchant's data lives in exactly one of them.
export type ZohoDataCentre = 'com' | 'eu' | 'in' | 'com.au' | 'jp';

export const ZOHO_DATA_CENTRES: Record<
  ZohoDataCentre,
  { accounts: string; api: string }
> = {
  com: { accounts: 'https://accounts.zoho.com', api: 'https://www.zohoapis.com/books/v3' },
  eu: { accounts: 'https://accounts.zoho.eu', api: 'https://www.zohoapis.eu/books/v3' },
  in: { accounts: 'https://accounts.zoho.in', api: 'https://www.zohoapis.in/books/v3' },
  'com.au': { accounts: 'https://accounts.zoho.com.au', api: 'https://www.zohoapis.com.au/books/v3' },
  jp: { accounts: 'https://accounts.zoho.jp', api: 'https://www.zohoapis.jp/books/v3' },
};

// Zoho tells the callback which accounts server the merchant signed in on
// ("accounts-server=https://accounts.zoho.eu"). Only known hosts are accepted,
// so a crafted value can't point the token exchange at another server.
export function zohoDataCentreFromAccountsServer(
  accountsServer?: string | null,
): ZohoDataCentre {
  if (!accountsServer) return 'com';
  let host: string;
  try {
    host = new URL(accountsServer).hostname.toLowerCase();
  } catch {
    return 'com';
  }
  for (const [dc, urls] of Object.entries(ZOHO_DATA_CENTRES)) {
    if (new URL(urls.accounts).hostname === host) return dc as ZohoDataCentre;
  }
  return 'com';
}

export function zohoDataCentreOrDefault(value?: string | null): ZohoDataCentre {
  return value && value in ZOHO_DATA_CENTRES ? (value as ZohoDataCentre) : 'com';
}
