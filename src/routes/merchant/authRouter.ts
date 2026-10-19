import { Router } from "express";
import * as auth from "../../controllers/merchant/authController";
import { authenticateMerchant } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// Merchant sign-up and sessions. Mounted at /merchant/auth (the merchant
// refresh cookie is scoped to this path). Codes also have a resend wait and an
// attempt limit, and logins lock an account after 10 failures.
const router = Router();

const MINUTE = 60 * 1000;
const codeRequestLimiter = createRateLimiter("merchant-auth-code-request", 10 * MINUTE, 10);
const codeVerifyLimiter = createRateLimiter("merchant-auth-code-verify", 10 * MINUTE, 20);
const signupLimiter = createRateLimiter("merchant-auth-signup", 10 * MINUTE, 10);
const loginLimiter = createRateLimiter("merchant-auth-login", MINUTE, 5);
const refreshLimiter = createRateLimiter("merchant-auth-refresh", MINUTE, 30);

router.post("/get-started", codeRequestLimiter, auth.getStarted);
router.post("/resend-code", codeRequestLimiter, auth.getStarted);
router.post("/verify-code", codeVerifyLimiter, auth.verifyCode);
router.post("/signup", signupLimiter, auth.signup);

router.post("/login", loginLimiter, auth.login);
router.post("/refresh", refreshLimiter, auth.refresh);
router.post("/logout", auth.logout);
router.get("/me", authenticateMerchant, auth.me);

export default router;
