import { Router } from "express";
import * as salonsController from "../../controllers/customer/salonsController";
import * as purchases from "../../controllers/customer/purchasesController";
import { createRateLimiter } from "../../utils/rateLimit";

// Public — salon search and salon pages. No session needed.
const router = Router();
// Each lookup matches names across every salon, so it is capped per visitor.
const linkLimiter = createRateLimiter("salon-link", 60_000, 60);

router.get("/service-types", salonsController.getServiceTypes);
router.get("/locations", salonsController.getLocations);
router.get("/", salonsController.listSalons);
router.get("/by-link/:link", linkLimiter, salonsController.getSalonByLink);
router.get("/:id", salonsController.getSalon);
router.get("/:id/reviews", salonsController.getReviews);
router.get("/:id/similar", salonsController.getSimilar);
router.get("/:id/membership-packages", purchases.salonPackages);
router.get("/:id/gift-cards", purchases.salonGiftCards);

export default router;
