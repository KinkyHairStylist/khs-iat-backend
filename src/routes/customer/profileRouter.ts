import { Router } from "express";
import * as profile from "../../controllers/customer/profileController";
import { authenticate } from "../../middlewares/authenticate";
import { imageUpload } from "../../middlewares/imageUpload";
import { createRateLimiter } from "../../utils/rateLimit";

// The customer's profile and address book. Mounted at /customer.
const router = Router();

router.use(authenticate);

const editLimiter = createRateLimiter("profile-edit", 60 * 1000, 30);
// Each upload writes to the public bucket.
const photoLimiter = createRateLimiter("profile-photo", 60 * 60 * 1000, 20);

router.get("/profile", profile.profile);
router.patch("/profile", editLimiter, profile.editProfile);
router.put("/profile/avatar", photoLimiter, imageUpload, profile.uploadPhoto);
router.delete("/profile/avatar", editLimiter, profile.deletePhoto);

router.get("/addresses", profile.addresses);
router.post("/addresses", editLimiter, profile.createAddress);
router.patch("/addresses/:id", editLimiter, profile.editAddress);
router.delete("/addresses/:id", editLimiter, profile.removeAddress);

export default router;
