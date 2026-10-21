import { Request, Response } from "express";
import { COOKIE_SECURE, CUSTOMER_APP_URL, MERCHANT_APP_URL } from "../config/env";
import { AppError } from "../middlewares/centralAppError";
import { claimPending, finishGoogleSignIn, startGoogleSignIn } from "../services/auth/googleAuthService";
import { setAccessCookie, setRefreshCookie, type SessionRole } from "../utils/authCookies";
import { getServiceLogger } from "../utils/loggerCreator";

const logger = getServiceLogger("google-sign-in");

// GET /auth/google/start → Google → GET /auth/google/callback → back to the app,
// signed in (the same session cookies as a password login). Every failure lands
// on /auth with ?googleError=<code> for the page to explain.

const BROWSER_COOKIE = "khs_google_login";
// Lax, not Strict: Google's redirect back is a cross-site navigation, and a Strict cookie wouldn't come with it.
const browserCookie = { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax" as const, path: "/api/v1/auth/google", maxAge: 10 * 60_000 };

/** A same-site path, never another site ("//evil.com", "https://…"). */
const sitePath = (value: unknown): string | null => {
  const v = typeof value === "string" ? value.trim() : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") && v.length <= 300 ? v : null;
};
const roleOf = (value: unknown): SessionRole => (value === "merchant" || value === "business" ? "merchant" : "customer");
const appUrl = (role: SessionRole) => (role === "merchant" ? MERCHANT_APP_URL : CUSTOMER_APP_URL).replace(/\/+$/, "");
const backToAuth = (res: Response, role: SessionRole, code: string) =>
  res.redirect(302, `${appUrl(role)}/auth?${new URLSearchParams({ role, step: "login", googleError: code })}`);

export async function googleStart(req: Request, res: Response): Promise<void> {
  const role = roleOf(req.query.role);
  const ref = typeof req.query.ref === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(req.query.ref) ? req.query.ref : null;
  try {
    const { url, browser } = await startGoogleSignIn({ role, redirect: sitePath(req.query.redirect), ref });
    res.cookie(BROWSER_COOKIE, browser, browserCookie);
    res.redirect(302, url);
  } catch (err) {
    backToAuth(res, role, err instanceof AppError ? err.code ?? "GOOGLE_FAILED" : "GOOGLE_FAILED");
  }
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const browser = typeof req.cookies?.[BROWSER_COOKIE] === "string" ? req.cookies[BROWSER_COOKIE] : undefined;
  res.clearCookie(BROWSER_COOKIE, { ...browserCookie, maxAge: undefined });

  const pending = await claimPending(state, browser).catch(() => null);
  if (!pending) return backToAuth(res, "customer", "GOOGLE_EXPIRED");
  // Declined on Google's screen (?error=access_denied).
  if (req.query.error || !code) return backToAuth(res, pending.role, "GOOGLE_CANCELLED");

  try {
    const result = await finishGoogleSignIn(pending, code);
    setAccessCookie(res, result.session.accessToken, result.role);
    if (result.session.refreshToken) setRefreshCookie(res, result.session.refreshToken, result.role);
    const next =
      result.role === "merchant"
        ? result.created ? "/merchant/business-setup/step-1" : pending.redirect?.startsWith("/merchant/") ? pending.redirect : "/merchant/dashboard"
        : pending.redirect ?? "/customer/salonListing";
    res.redirect(302, `${appUrl(result.role)}${next}`);
  } catch (err) {
    if (!(err instanceof AppError)) logger.error("Google sign-in failed", { error: (err as Error).message });
    backToAuth(res, pending.role, err instanceof AppError ? err.code ?? "GOOGLE_FAILED" : "GOOGLE_FAILED");
  }
}
