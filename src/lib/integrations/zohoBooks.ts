import { MERCHANT_APP_URL, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REDIRECT_URI } from "../../config/env";
import { IntegrationAuthError, IntegrationCallError } from "./errors";
import { callProvider } from "./http";

// Zoho OAuth + Books v3 over REST. Zoho runs separate regions and a salon's data
// lives in one; only these known hosts are ever called, so a crafted callback
// can't point the token exchange somewhere else.

export const ZOHO_DATA_CENTRES = {
  com: { accounts: "https://accounts.zoho.com", api: "https://www.zohoapis.com/books/v3" },
  eu: { accounts: "https://accounts.zoho.eu", api: "https://www.zohoapis.eu/books/v3" },
  in: { accounts: "https://accounts.zoho.in", api: "https://www.zohoapis.in/books/v3" },
  "com.au": { accounts: "https://accounts.zoho.com.au", api: "https://www.zohoapis.com.au/books/v3" },
  jp: { accounts: "https://accounts.zoho.jp", api: "https://www.zohoapis.jp/books/v3" },
} as const;
export type ZohoDataCentre = keyof typeof ZOHO_DATA_CENTRES;

export const zohoRedirectUri = () => ZOHO_REDIRECT_URI || `${MERCHANT_APP_URL}/merchant/dashboard/settings?tab=integrations&type=zohobooks`;
export const zohoConfigured = (): boolean => !!(ZOHO_CLIENT_ID && ZOHO_CLIENT_SECRET);

/** The region Zoho reports on the redirect ("accounts-server"); anything unknown is the default region. */
export function zohoDataCentreFrom(accountsServer?: string | null): ZohoDataCentre {
  if (!accountsServer) return "com";
  let host: string;
  try {
    host = new URL(accountsServer).hostname.toLowerCase();
  } catch {
    return "com";
  }
  const hit = (Object.keys(ZOHO_DATA_CENTRES) as ZohoDataCentre[]).find((dc) => new URL(ZOHO_DATA_CENTRES[dc].accounts).hostname === host);
  return hit ?? "com";
}
export const zohoDataCentreOr = (value?: string | null): ZohoDataCentre => (value && value in ZOHO_DATA_CENTRES ? (value as ZohoDataCentre) : "com");

export function zohoAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: ZOHO_CLIENT_ID, redirect_uri: zohoRedirectUri(), response_type: "code", scope: "ZohoBooks.fullaccess.all",
    access_type: "offline", prompt: "consent", state,
  });
  return `${ZOHO_DATA_CENTRES.com.accounts}/oauth/v2/auth?${q}`;
}

interface TokenResponse { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }
export interface ZohoTokens { accessToken: string; refreshToken?: string; expiresAt: number }

async function token(dc: ZohoDataCentre, form: Record<string, string>, action: string): Promise<ZohoTokens> {
  const t = await callProvider<TokenResponse>("ZohoBooks", action, `${ZOHO_DATA_CENTRES[dc].accounts}/oauth/v2/token`, {
    form: { ...form, client_id: ZOHO_CLIENT_ID, client_secret: ZOHO_CLIENT_SECRET },
    authStatuses: [],
  });
  // Zoho answers 200 with { error } for a bad or revoked token.
  if (!t?.access_token) {
    if (action === "token refresh" && /invalid_code|invalid_client|invalid_grant/i.test(t?.error ?? "")) throw new IntegrationAuthError("ZohoBooks access was revoked. Please reconnect.");
    throw new IntegrationCallError("ZohoBooks", action, 400, t?.error ?? "no access token");
  }
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
}

export const exchangeZohoCode = (dc: ZohoDataCentre, code: string) =>
  token(dc, { code, redirect_uri: zohoRedirectUri(), grant_type: "authorization_code" }, "sign-in");
export const refreshZohoToken = (dc: ZohoDataCentre, refreshToken: string) =>
  token(dc, { refresh_token: refreshToken, grant_type: "refresh_token" }, "token refresh");

export async function revokeZohoToken(dc: ZohoDataCentre, refreshToken: string): Promise<void> {
  await callProvider("ZohoBooks", "revoke", `${ZOHO_DATA_CENTRES[dc].accounts}/oauth/v2/token/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST", authStatuses: [] }).catch(() => undefined);
}

/** A Books request for one organisation (Books wants organization_id on every call). */
export function books(dc: ZohoDataCentre, accessToken: string, organizationId: string) {
  const url = (path: string, query: Record<string, string> = {}) =>
    `${ZOHO_DATA_CENTRES[dc].api}${path}?${new URLSearchParams({ organization_id: organizationId, ...query })}`;
  const headers = { Authorization: `Zoho-oauthtoken ${accessToken}` };
  return {
    get: <T>(path: string, query?: Record<string, string>) => callProvider<T>("ZohoBooks", `GET ${path}`, url(path, query), { headers }),
    post: <T>(path: string, json?: unknown) => callProvider<T>("ZohoBooks", `POST ${path}`, url(path), { headers, method: "POST", json: json ?? {} }),
  };
}

export async function listOrganizations(dc: ZohoDataCentre, accessToken: string): Promise<Array<{ organization_id: string; name: string }>> {
  const r = await callProvider<{ organizations?: Array<{ organization_id: string; name: string }> }>("ZohoBooks", "organisations", `${ZOHO_DATA_CENTRES[dc].api}/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  return r.organizations ?? [];
}
