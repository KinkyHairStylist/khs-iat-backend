import { Router } from "express";
import * as salonsController from "../../controllers/customer/salonsController";
import * as purchases from "../../controllers/customer/purchasesController";

// Public — salon search and salon pages. No session needed.
const router = Router();

router.get("/service-types", salonsController.getServiceTypes);
router.get("/locations", salonsController.getLocations);
router.get("/", salonsController.listSalons);
router.get("/:id", salonsController.getSalon);
router.get("/:id/reviews", salonsController.getReviews);
router.get("/:id/similar", salonsController.getSimilar);
router.get("/:id/membership-packages", purchases.salonPackages);
router.get("/:id/gift-cards", purchases.salonGiftCards);

export default router;
