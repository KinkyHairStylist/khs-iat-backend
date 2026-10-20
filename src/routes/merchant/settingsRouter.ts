import { Router } from "express";
import * as s from "../../controllers/merchant/settingsController";
import { authenticateMerchant } from "../../middlewares/authenticate";
import { imageUpload } from "../../middlewares/imageUpload";
import { createRateLimiter } from "../../utils/rateLimit";

// Settings: salon rules and profile, and the owner's account. Mounted at /merchant.
const router = Router();
const editLimiter = createRateLimiter("merchant-settings-edit", 60_000, 30);
const photoLimiter = createRateLimiter("merchant-settings-photo", 10 * 60_000, 20);

router.use(authenticateMerchant);

router.get("/settings", s.settings);
router.put("/settings/notifications", editLimiter, s.notifications);
router.put("/settings/booking-rules", editLimiter, s.bookingRules);
router.put("/settings/cancellation", editLimiter, s.cancellation);
router.put("/settings/deposit", editLimiter, s.deposit);

router.get("/business", s.business);
router.put("/business/info", editLimiter, s.businessInfo);
router.put("/business/hours", editLimiter, s.businessHours);
router.put("/business/location", editLimiter, s.businessLocation);
router.post("/business/gallery", photoLimiter, imageUpload, s.addGallery);
router.delete("/business/gallery", editLimiter, s.removeGallery);

router.get("/account/profile", s.profile);
router.patch("/account/profile", editLimiter, s.editProfile);
router.put("/account/profile/avatar", photoLimiter, imageUpload, s.uploadPhoto);
router.delete("/account/profile/avatar", editLimiter, s.deletePhoto);
router.get("/account/addresses", s.addresses);
router.post("/account/addresses", editLimiter, s.createAddress);
router.patch("/account/addresses/:id", editLimiter, s.editAddress);
router.delete("/account/addresses/:id", editLimiter, s.removeAddress);

export default router;
