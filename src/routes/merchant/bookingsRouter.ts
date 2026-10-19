import { Router } from "express";
import * as bookings from "../../controllers/merchant/bookingsController";
import * as blocked from "../../controllers/merchant/blockedTimesController";
import { authenticateMerchant } from "../../middlewares/authenticate";

// The salon's bookings calendar and blocked-out time. Mounted at /merchant.
const router = Router();

router.use(authenticateMerchant);

router.get("/bookings", bookings.list);
router.post("/bookings", bookings.create);
router.get("/bookings/form-options", bookings.formOptions);
router.get("/bookings/available-times", bookings.availableTimes);
router.get("/bookings/:id", bookings.detail);
router.post("/bookings/:id/accept", bookings.accept);
router.post("/bookings/:id/cancel", bookings.cancel);
router.post("/bookings/:id/complete", bookings.complete);
router.post("/bookings/:id/no-show", bookings.noShow);
router.post("/bookings/:id/reschedule", bookings.reschedule);
router.put("/bookings/:id/staff", bookings.staff);

router.get("/blocked-times", blocked.list);
router.post("/blocked-times", blocked.create);
router.put("/blocked-times/:id", blocked.update);
router.delete("/blocked-times/:id", blocked.remove);

export default router;
