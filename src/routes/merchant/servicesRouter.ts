import { Router } from "express";
import * as services from "../../controllers/merchant/servicesController";
import { authenticateMerchant } from "../../middlewares/authenticate";
import { imageUpload } from "../../middlewares/imageUpload";
import { createRateLimiter } from "../../utils/rateLimit";

// The salon's services and categories. Mounted at /merchant.
const router = Router();
const uploadLimiter = createRateLimiter("merchant-service-image", 10 * 60_000, 40);

router.use(authenticateMerchant);

router.get("/services", services.list);
router.post("/services", services.create);
router.get("/services/advertising-plans", services.plans);
router.post("/services/images", uploadLimiter, imageUpload, services.uploadImage);
router.put("/services/:id", services.update);
router.delete("/services/:id", services.remove);
router.put("/services/:id/staff", services.staff);

router.post("/service-categories", services.addCategoryHandler);
router.delete("/service-categories/:category", services.removeCategoryHandler);

export default router;
