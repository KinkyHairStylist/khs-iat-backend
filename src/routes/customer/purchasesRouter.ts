import { Router } from "express";
import * as purchases from "../../controllers/customer/purchasesController";
import { authenticate } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// The customer's memberships and gift cards, and buying them. Mounted at /customer.
const router = Router();

router.use(authenticate);

// Each purchase start creates a Stripe payment.
const purchaseLimiter = createRateLimiter("purchase", 60 * 1000, 20);
// Codes are guessable only by brute force, so checking one is limited.
const giftCardCheckLimiter = createRateLimiter("gift-card-check", 60 * 1000, 20);

router.get("/memberships", purchases.ownedMemberships);
router.get("/memberships/shop", purchases.packageShop);
router.get("/memberships/shop/:id", purchases.packageForSale);
router.post("/memberships/purchase", purchaseLimiter, purchases.buyPackage);
router.post("/memberships/purchase/complete", purchaseLimiter, purchases.completePackage);

router.get("/gift-cards/owned", purchases.ownedGiftCards);
router.get("/gift-cards/shop", purchases.giftCardShop);
router.get("/gift-cards/shop/:id", purchases.giftCardForSale);
router.post("/gift-cards/validate", giftCardCheckLimiter, purchases.checkGiftCard);
router.post("/gift-cards/purchase", purchaseLimiter, purchases.buyGiftCard);
router.post("/gift-cards/purchase/complete", purchaseLimiter, purchases.completeGiftCard);

export default router;
