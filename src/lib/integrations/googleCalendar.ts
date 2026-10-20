import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, MERCHANT_APP_URL } from "../../config/env";
import { IntegrationAuthError, IntegrationCallError } from "./errors";
import { callProvider } from "./http";

// Google OAuth + Calendar v3 over REST, with the salon's token on each request.

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

export const googleRedirectUri = () => GOOGLE_REDIRECT_URI || `${MERCHANT_APP_URL}/merchant/dashboard/settings?tab=integrations`;
export const googleConfigured = (): boolean => !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

export function googleAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: googleRedirectUri(), response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `${AUTH}?${q}`;
}

export interface GoogleTokens { accessToken: string; refreshToken?: string; expiresAt: number }

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }

const toTokens = (t: TokenResponse): GoogleTokens => ({ accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 });

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
  const t = await callProvider<TokenResponse>("Google", "sign-in", TOKEN, {
    form: { code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri(), grant_type: "authorization_code" },
    authStatuses: [],
  });
  if (!t?.access_token) throw new IntegrationCallError("Google", "sign-in", 400, t?.error ?? "no access token");
  return toTokens(t);
}

/** A revoked grant comes back as 400 invalid_grant. */
export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens> {
  try {
    const t = await callProvider<TokenResponse>("Google", "token refresh", TOKEN, {
      form: { refresh_token: refreshToken, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" },
      authStatuses: [400, 401],
    });
    return toTokens(t);
  } catch (err) {
    if (err instanceof IntegrationAuthError) throw new IntegrationAuthError("Google Calendar access was revoked. Please reconnect.");
    throw err;
  }
}

export async function revokeGoogleToken(token: string): Promise<void> {
  await callProvider("Google", "revoke", `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", authStatuses: [] }).catch(() => undefined);
}

export interface CalendarEvent {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees: Array<{ email: string; displayName?: string }>;
  reminders: { useDefault: false; overrides: Array<{ method: "email" | "popup"; minutes: number }> };
  colorId?: string;
}

const auth = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });
const cal = (calendarId: string) => `${API}/calendars/${encodeURIComponent(calendarId)}`;

export async function calendarTimeZone(accessToken: string, calendarId: string): Promise<string> {
  const c = await callProvider<{ timeZone?: string }>("Google", "calendar read", cal(calendarId), { headers: auth(accessToken) });
  return c?.timeZone || "UTC";
}

export async function insertEvent(accessToken: string, calendarId: string, event: CalendarEvent): Promise<string> {
  const e = await callProvider<{ id: string }>("Google", "event create", `${cal(calendarId)}/events?sendUpdates=all`, { headers: auth(accessToken), json: event });
  return e.id;
}

/** False when the event no longer exists (deleted in Google), so the caller can create a new one. */
export async function updateEvent(accessToken: string, calendarId: string, eventId: string, event: CalendarEvent): Promise<boolean> {
  try {
    await callProvider("Google", "event update", `${cal(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "PUT", headers: auth(accessToken), json: event });
    return true;
  } catch (err) {
    if (err instanceof IntegrationCallError && (err.status === 404 || err.status === 410)) return false;
    throw err;
  }
}

/** An event that's already gone counts as deleted. */
export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  await callProvider("Google", "event delete", `${cal(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE", headers: auth(accessToken), okStatuses: [204, 404, 410] });
}
