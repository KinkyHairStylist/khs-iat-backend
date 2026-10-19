import { Router } from "express";
import * as account from "../../controllers/customer/accountController";
import { authenticate } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// The signed-in customer's own data. Mounted at /customer.
const router = Router();

router.use(authenticate);

// A heart can be tapped quickly; this only stops scripted floods.
const favoriteLimiter = createRateLimiter("favorites", 60 * 1000, 60);

router.get("/favorites", account.favoritesList);
router.get("/favorites/ids", account.favoriteIds);
router.post("/favorites", favoriteLimiter, account.addFavorite);
router.delete("/favorites/service/:serviceId", favoriteLimiter, account.removeFavorite);
router.get("/preferences", account.preferences);
router.get("/dashboard", account.dashboard);
router.get("/referrals", account.referrals);

// "Helpful" on a salon review — counted once per customer.
const helpfulLimiter = createRateLimiter("review-helpful", 60 * 1000, 30);
router.get("/salons/:id/reviews/helpful", account.helpfulReviews);
router.post("/reviews/:reviewId/helpful", helpfulLimiter, account.markHelpful);

export default router;
