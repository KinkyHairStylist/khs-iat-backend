import { Router } from "express";
import * as billing from "../../controllers/customer/billingController";
import { authenticate } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// Billing history. Mounted at /customer.
const router = Router();

router.use(authenticate);

// Each request emails the team and posts to Slack.
const refundLimiter = createRateLimiter("refund-request", 60 * 60 * 1000, 10);

router.get("/transactions", billing.transactions);
router.get("/transactions/summary", billing.summary);
router.post("/transactions/:id/refund-request", refundLimiter, billing.refundRequest);

export default router;
