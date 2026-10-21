import { Router } from "express";
import * as authController from "../controllers/authController";
import { googleCallback, googleStart } from "../controllers/googleAuthController";
import { authenticate } from "../middlewares/authenticate";
import { createRateLimiter } from "../utils/rateLimit";

// Customer sign-up, sessions and password reset. Per-IP limits here; the
// codes themselves also have a resend wait and an attempt limit
// (lib/redis/codeStore) and logins lock an account after 10 failures.
const router = Router();

const MINUTE = 60 * 1000;
const codeRequestLimiter = createRateLimiter("auth-code-request", 10 * MINUTE, 10);
const codeVerifyLimiter = createRateLimiter("auth-code-verify", 10 * MINUTE, 20);
const signupLimiter = createRateLimiter("auth-signup", 10 * MINUTE, 10);
const loginLimiter = createRateLimiter("auth-login", MINUTE, 5);
const refreshLimiter = createRateLimiter("auth-refresh", MINUTE, 30);
const googleLimiter = createRateLimiter("auth-google", 10 * MINUTE, 30);

// Sign-up: email → code → details.
router.post("/get-started", codeRequestLimiter, authController.getStarted);
router.post("/resend-code", codeRequestLimiter, authController.resendCode);
router.post("/verify-code", codeVerifyLimiter, authController.verifyCode);
router.post("/signup", signupLimiter, authController.signup);

// Sessions.
router.post("/login", loginLimiter, authController.login);
router.post("/refresh", refreshLimiter, authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", authenticate, authController.me);

// Continue with Google (customers and business owners; ?role= picks which). Browser navigations, not API calls.
router.get("/google/start", googleLimiter, googleStart);
router.get("/google/callback", googleLimiter, googleCallback);

// Password reset: email → code → new password.
router.post("/reset-password/start", codeRequestLimiter, authController.startPasswordReset);
router.post("/reset-password/verify", codeVerifyLimiter, authController.verifyPasswordReset);
router.post("/reset-password/finish", signupLimiter, authController.finishPasswordReset);

export default router;
