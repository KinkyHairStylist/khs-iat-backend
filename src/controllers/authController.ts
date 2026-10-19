import { Request, Response } from "express";
import { AppError, catchAsync } from "../middlewares/centralAppError";
import { parseSchema } from "../utils/parseSchema";
import { clearAuthCookies, readRefreshCookie, setAccessCookie, setRefreshCookie } from "../utils/authCookies";
import {
  emailOnlySchema,
  getStartedSchema,
  loginSchema,
  resetFinishSchema,
  resetVerifySchema,
  signupSchema,
  verifyCodeSchema,
} from "../schemas/auth.schema";
import * as authService from "../services/auth";
import type { SessionResult } from "../services/auth";

function requireUser(req: Request): NonNullable<Request["user"]> {
  if (!req.user) throw AppError.unauthorized("Please log in to continue.");
  return req.user;
}

// Tokens stay in the httpOnly cookies — only the profile goes in the body.
function setSessionCookies(res: Response, session: SessionResult): void {
  setAccessCookie(res, session.accessToken);
  if (session.refreshToken) setRefreshCookie(res, session.refreshToken);
}

// ─── Sign-up ──────────────────────────────────────────────────────────────────

export const getStarted = catchAsync(async (req: Request, res: Response) => {
  const input = parseSchema(getStartedSchema, req.body);
  await authService.startSignup(input);
  res.success(null, "We've sent a verification code to your email.");
});

export const resendCode = catchAsync(async (req: Request, res: Response) => {
  const { email } = parseSchema(emailOnlySchema, req.body);
  await authService.startSignup({ email, refCode: undefined });
  res.success(null, "We've sent you a new code.");
});

export const verifyCode = catchAsync(async (req: Request, res: Response) => {
  const input = parseSchema(verifyCodeSchema, req.body);
  res.success(await authService.verifySignupCode(input), "Your email is verified.");
});

export const signup = catchAsync(async (req: Request, res: Response) => {
  const input = parseSchema(signupSchema, req.body);
  const session = await authService.completeSignup(input);
  setSessionCookies(res, session);
  res.success({ user: session.user }, "Your account has been created.", 201);
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const login = catchAsync(async (req: Request, res: Response) => {
  const input = parseSchema(loginSchema, req.body);
  const session = await authService.login(input);
  setSessionCookies(res, session);
  res.success({ user: session.user }, "Welcome back.");
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = readRefreshCookie(req);
  if (!refreshToken) throw AppError.unauthorized("Your session has ended. Please log in again.", "SESSION_EXPIRED");

  try {
    const session = await authService.refreshSession(refreshToken);
    setSessionCookies(res, session);
    res.success({ user: session.user }, "Session refreshed.");
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
});

/** Always succeeds and always clears the cookies — works even after the access token expired. */
export const logout = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = readRefreshCookie(req);
  if (refreshToken) await authService.logoutByRefreshToken(refreshToken);
  clearAuthCookies(res);
  res.success(null, "You've been logged out.");
});

export const me = catchAsync(async (req: Request, res: Response) => {
  res.success(await authService.getProfile(requireUser(req).sub));
});

// ─── Password reset ───────────────────────────────────────────────────────────

export const startPasswordReset = catchAsync(async (req: Request, res: Response) => {
  const { email } = parseSchema(emailOnlySchema, req.body);
  res.success(null, await authService.startPasswordReset(email));
});

export const verifyPasswordReset = catchAsync(async (req: Request, res: Response) => {
  const input = parseSchema(resetVerifySchema, req.body);
  res.success(await authService.verifyPasswordResetCode(input), "Code verified. You can now choose a new password.");
});

export const finishPasswordReset = catchAsync(async (req: Request, res: Response) => {
  const input = parseSchema(resetFinishSchema, req.body);
  await authService.finishPasswordReset(input);
  res.success(null, "Your password has been reset. You can now log in.");
});
