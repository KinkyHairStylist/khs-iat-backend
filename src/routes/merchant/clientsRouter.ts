import { Router } from "express";
import * as clients from "../../controllers/merchant/clientsController";
import { authenticateMerchant } from "../../middlewares/authenticate";
import { imageUpload } from "../../middlewares/imageUpload";
import { createRateLimiter } from "../../utils/rateLimit";

// The salon's client records, messages to them and their reviews. Mounted at /merchant.
const router = Router();
const uploadLimiter = createRateLimiter("merchant-client-image", 10 * 60_000, 30);
// Short bursts only; the real cap is the daily sending limit per salon.
const messageLimiter = createRateLimiter("merchant-client-message", 60_000, 10);

router.use(authenticateMerchant);

router.get("/clients", clients.list);
router.post("/clients", clients.create);
router.get("/clients/messaging", clients.messagingList);
router.post("/clients/messages", messageLimiter, clients.message);
router.post("/clients/images", uploadLimiter, imageUpload, clients.uploadImage);
router.get("/clients/:id", clients.detail);
router.put("/clients/:id", clients.update);
router.delete("/clients/:id", clients.remove);
router.get("/clients/:id/appointments", clients.appointments);
router.get("/clients/:id/overview", clients.overview);
router.get("/clients/:id/reviews", clients.reviews);
router.put("/clients/:id/reviews/:reviewId/reply", clients.reply);

export default router;
