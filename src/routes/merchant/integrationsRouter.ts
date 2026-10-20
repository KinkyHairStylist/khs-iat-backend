import { Router } from "express";
import * as integrations from "../../controllers/merchant/integrationsController";
import { authenticateMerchant } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// Settings → Integrations: the salon's own Google Calendar, Mailchimp and ZohoBooks. Mounted at /merchant.
const router = Router();
const connectLimiter = createRateLimiter("merchant-integrations", 10 * 60_000, 30);

router.use(authenticateMerchant);

router.get("/integrations", integrations.status);
router.post("/integrations/google-calendar/connect", connectLimiter, integrations.startGoogle);
router.post("/integrations/google-calendar/callback", connectLimiter, integrations.finishGoogle);
router.delete("/integrations/google-calendar", connectLimiter, integrations.disconnectGoogle);
router.post("/integrations/zohobooks/connect", connectLimiter, integrations.startZoho);
router.post("/integrations/zohobooks/callback", connectLimiter, integrations.finishZoho);
router.delete("/integrations/zohobooks", connectLimiter, integrations.disconnectZoho);
router.post("/integrations/mailchimp", connectLimiter, integrations.connectMailchimp);
router.delete("/integrations/mailchimp", connectLimiter, integrations.disconnectMailchimp);

export default router;
