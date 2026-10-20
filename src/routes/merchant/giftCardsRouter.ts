import { Router } from "express";
import * as giftCards from "../../controllers/merchant/giftCardsController";
import { authenticateMerchant } from "../../middlewares/authenticate";

// The salon's gift cards. Mounted at /merchant.
const router = Router();

router.use(authenticateMerchant);

router.get("/gift-cards", giftCards.list);
router.post("/gift-cards", giftCards.create);
router.get("/gift-cards/summary", giftCards.summary);
router.get("/gift-cards/:id", giftCards.detail);
router.put("/gift-cards/:id", giftCards.update);
router.put("/gift-cards/:id/deactivate", giftCards.deactivate);
router.put("/gift-cards/:id/reactivate", giftCards.reactivate);
router.delete("/gift-cards/:id", giftCards.remove);

export default router;
