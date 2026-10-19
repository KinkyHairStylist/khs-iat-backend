import { Router } from "express";
import * as dashboard from "../../controllers/merchant/dashboardController";
import { authenticateMerchant } from "../../middlewares/authenticate";

// The merchant dashboard's home and its plan status. Mounted at /merchant.
const router = Router();

router.use(authenticateMerchant);

router.get("/dashboard", dashboard.home);
router.get("/dashboard/stats", dashboard.stats);
router.get("/subscription/status", dashboard.subscriptionStatus);

export default router;
