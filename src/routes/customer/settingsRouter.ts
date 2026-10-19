import { Router } from "express";
import * as settings from "../../controllers/customer/settingsController";
import { authenticate } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// Settings. Mounted at /customer.
const router = Router();

router.use(authenticate);

// Switches can be flipped quickly; this only stops scripted floods.
const toggleLimiter = createRateLimiter("settings", 60 * 1000, 60);
// Each try checks the current password, so guessing it is limited (per IP).
const passwordLimiter = createRateLimiter("password-change", 15 * 60 * 1000, 10);
const accountLimiter = createRateLimiter("account-close", 60 * 60 * 1000, 5);

router.patch("/preferences", toggleLimiter, settings.editPreferences);
router.get("/notification-settings", settings.notificationSettings);
router.patch("/notification-settings", toggleLimiter, settings.editNotificationSettings);
router.get("/cards", settings.cards);
router.delete("/cards/:id", toggleLimiter, settings.removeCard);
router.post("/password", passwordLimiter, settings.updatePassword);
router.delete("/account", accountLimiter, settings.deleteAccount);

export default router;
