import { Request, Response } from "express";
import { AppError, catchAsync } from "../../middlewares/centralAppError";
import { parseSchema } from "../../utils/parseSchema";
import { clearAuthCookies, readRefreshCookie, setAccessCookie, setRefreshCookie } from "../../utils/authCookies";
import { loginSchema, verifyCodeSchema } from "../../schemas/auth.schema";
import { merchantEmailSchema, merchantSignupSchema } from "../../schemas/merchant/auth.schema";
import { getProfile, login as loginAs, logoutByRefreshToken, refreshSession, type SessionResult } from "../../services/auth";
import { completeMerchantSignup, startMerchantSignup, verifyMerchantSignupCode } from "../../services/merchant/auth/merchantSignupService";
import { getMerchantBusiness } from "../../services/merchant/auth/merchantContext";

// Merchant sign-up and sessions. Password reset is shared with customers (/auth/reset-password/*).

function setSessionCookies(res: Response, session: SessionResult): void {
  setAccessCookie(res, session.accessToken, "merchant");
  if (session.refreshToken) setRefreshCookie(res, session.refreshToken, "merchant");
}

/** The profile plus whether the merchant has a business yet. */
async function sessionBody(session: SessionResult) {
  return { user: session.user, ...(await getMerchantBusiness(session.user.id)) };
}

export const getStarted = catchAsync(async (req: Request, res: Response) => {
  await startMerchantSignup(parseSchema(merchantEmailSchema, req.body).email);
  res.success(null, "We've sent a verification code to your email.");
});

export const verifyCode = catchAsync(async (req: Request, res: Response) => {
  res.success(await verifyMerchantSignupCode(parseSchema(verifyCodeSchema, req.body)), "Your email is verified.");
});

export const signup = catchAsync(async (req: Request, res: Response) => {
  const session = await completeMerchantSignup(parseSchema(merchantSignupSchema, req.body));
  setSessionCookies(res, session);
  res.success(await sessionBody(session), "Your business account has been created.", 201);
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const session = await loginAs(parseSchema(loginSchema, req.body), "merchant");
  setSessionCookies(res, session);
  res.success(await sessionBody(session), "Welcome back.");
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = readRefreshCookie(req, "merchant");
  if (!refreshToken) throw AppError.unauthorized("Your session has ended. Please log in again.", "SESSION_EXPIRED");
  try {
    const session = await refreshSession(refreshToken, "merchant");
    setSessionCookies(res, session);
    res.success(await sessionBody(session), "Session refreshed.");
  } catch (err) {
    clearAuthCookies(res, "merchant");
    throw err;
  }
});

/** Always succeeds and always clears the cookies. */
export const logout = catchAsync(async (req: Request, res: Response) => {
  const refreshToken = readRefreshCookie(req, "merchant");
  if (refreshToken) await logoutByRefreshToken(refreshToken);
  clearAuthCookies(res, "merchant");
  res.success(null, "You've been logged out.");
});

export const me = catchAsync(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const user = await getProfile(req.user.sub);
  res.success({ user, ...(await getMerchantBusiness(user.id)) });
});
