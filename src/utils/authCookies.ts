import { CookieOptions, Request, Response } from "express";
import {
  ACCESS_TOKEN_TTL_MINUTES,
  COOKIE_DOMAIN,
  COOKIE_SAMESITE,
  COOKIE_SECURE,
  REFRESH_TOKEN_TTL_DAYS,
} from "../config/env";

/** Customers and merchants sign in separately: each has its own pair of cookies. */
export type SessionRole = "customer" | "merchant";

// Browsers only accept the "__Secure-" prefix on Secure cookies, and in
// return guarantee the cookie was set over HTTPS and can't be overwritten by
// an insecure origin.
const PREFIX = COOKIE_SECURE ? "__Secure-" : "";

const COOKIES: Record<SessionRole, { access: string; refresh: string; refreshPath: string }> = {
  // The refresh token is only ever sent to the auth routes that need it.
  customer: { access: `${PREFIX}khs_customer_at`, refresh: `${PREFIX}khs_customer_rt`, refreshPath: "/api/v1/auth" },
  merchant: { access: `${PREFIX}khs_merchant_at`, refresh: `${PREFIX}khs_merchant_rt`, refreshPath: "/api/v1/merchant/auth" },
};

export const ACCESS_COOKIE = COOKIES.customer.access;
export const REFRESH_COOKIE = COOKIES.customer.refresh;
export const MERCHANT_ACCESS_COOKIE = COOKIES.merchant.access;

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE as CookieOptions["sameSite"],
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
}

export function setAccessCookie(res: Response, accessToken: string, role: SessionRole = "customer"): void {
  res.cookie(COOKIES[role].access, accessToken, {
    ...baseOptions(),
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
  });
}

export function setRefreshCookie(res: Response, refreshToken: string, role: SessionRole = "customer"): void {
  res.cookie(COOKIES[role].refresh, refreshToken, {
    ...baseOptions(),
    path: COOKIES[role].refreshPath,
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response, role: SessionRole = "customer"): void {
  res.clearCookie(COOKIES[role].access, { ...baseOptions(), path: "/" });
  res.clearCookie(COOKIES[role].refresh, { ...baseOptions(), path: COOKIES[role].refreshPath });
}

function readCookie(req: Request, name: string): string | undefined {
  const value = req.cookies?.[name];
  return typeof value === "string" && value ? value : undefined;
}

export function readAccessCookie(req: Request, role: SessionRole = "customer"): string | undefined {
  return readCookie(req, COOKIES[role].access);
}

export function readRefreshCookie(req: Request, role: SessionRole = "customer"): string | undefined {
  return readCookie(req, COOKIES[role].refresh);
}
