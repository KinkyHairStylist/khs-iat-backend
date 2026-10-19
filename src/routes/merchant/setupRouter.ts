import { Router } from "express";
import * as setup from "../../controllers/merchant/setupController";
import { authenticateMerchant } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// Business setup. Mounted at /merchant. The plans are public (the pricing page shows them).
const router = Router();

// Each call creates Stripe objects or a business.
const paymentLimiter = createRateLimiter("merchant-setup-payment", 10 * 60 * 1000, 10);
const createLimiter = createRateLimiter("merchant-setup-create", 10 * 60 * 1000, 10);

router.get("/plans", setup.plans);
router.post("/setup/card-setup", authenticateMerchant, paymentLimiter, setup.cardSetup);
router.post("/setup/subscribe", authenticateMerchant, paymentLimiter, setup.subscribe);
router.post("/setup/business", authenticateMerchant, createLimiter, setup.business);

export default router;
