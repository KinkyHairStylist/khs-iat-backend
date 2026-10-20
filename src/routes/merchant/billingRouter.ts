import { Router } from "express";
import * as billing from "../../controllers/merchant/billingController";
import { authenticateMerchant } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// The merchant's plan billing (status is GET /merchant/subscription/status, plans GET /merchant/plans). Mounted at /merchant.
const router = Router();
const paymentLimiter = createRateLimiter("merchant-billing", 10 * 60_000, 20);

router.use(authenticateMerchant);

router.post("/billing/card-setup", paymentLimiter, billing.cardSetup);
router.post("/billing/subscribe", paymentLimiter, billing.subscribe);
router.post("/billing/card", paymentLimiter, billing.updateCard);

export default router;
