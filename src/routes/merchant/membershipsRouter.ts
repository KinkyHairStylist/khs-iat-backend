import { Router } from "express";
import * as memberships from "../../controllers/merchant/membershipsController";
import { authenticateMerchant } from "../../middlewares/authenticate";

// The salon's membership packages. Mounted at /merchant.
const router = Router();

router.use(authenticateMerchant);

router.get("/membership-packages", memberships.list);
router.post("/membership-packages", memberships.create);
router.put("/membership-packages/:id/deactivate", memberships.deactivate);

export default router;
