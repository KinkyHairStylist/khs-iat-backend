import crypto from "node:crypto";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_LOGIN_REDIRECT_URI, PORT } from "../config/env";

// "Continue with Google": the OAuth authorization-code flow with PKCE, run on
// the server. The ID token comes straight from Google's token endpoint over
// TLS, so its claims are trusted as sent (OpenID Connect §3.1.3.7); its issuer
// and audience are still checked.

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export const googleSignInConfigured = (): boolean => !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
export const googleSignInRedirectUri = () => GOOGLE_LOGIN_REDIRECT_URI || `http://localhost:${PORT}/api/v1/auth/google/callback`;

const base64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A PKCE verifier and its S256 challenge. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(32));
  return { verifier, challenge: base64url(crypto.createHash("sha256").update(verifier).digest()) };
}

export function googleSignInUrl(state: string, challenge: string): string {
  const q = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: googleSignInRedirectUri(), response_type: "code", scope: "openid email profile",
    state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return `${AUTH}?${q}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
}

/** Exchanges the code for the user's verified identity. Throws on any failure. */
export async function googleIdentity(code: string, verifier: string): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, code_verifier: verifier, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: googleSignInRedirectUri(), grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
  if (!res.ok || !body.id_token) throw new Error(`Google token exchange failed: ${body.error ?? res.status}`);
  const payload = JSON.parse(Buffer.from(body.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  if (!ISSUERS.has(String(payload.iss)) || payload.aud !== GOOGLE_CLIENT_ID || !payload.sub || !payload.email) throw new Error("Unexpected Google ID token");
  return {
    sub: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    firstName: typeof payload.given_name === "string" ? payload.given_name.slice(0, 80) : null,
    lastName: typeof payload.family_name === "string" ? payload.family_name.slice(0, 80) : null,
  };
}
