import { Router } from "express";
import * as staff from "../../controllers/merchant/staffController";
import { authenticateMerchant } from "../../middlewares/authenticate";
import { imageUpload } from "../../middlewares/imageUpload";
import { createRateLimiter } from "../../utils/rateLimit";

// The salon's team. Mounted at /merchant.
const router = Router();
const uploadLimiter = createRateLimiter("merchant-staff-image", 10 * 60_000, 30);

router.use(authenticateMerchant);

router.get("/staff", staff.list);
router.post("/staff", staff.create);
router.post("/staff/images", uploadLimiter, imageUpload, staff.uploadImage);
router.put("/staff/:id", staff.update);
router.delete("/staff/:id", staff.remove);
router.get("/staff/:id/schedule", staff.schedule);
router.put("/staff/:id/services", staff.services);

export default router;
