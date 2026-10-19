import { Router } from "express";
import * as bookings from "../../controllers/customer/bookingsController";
import { authenticate } from "../../middlewares/authenticate";
import { createRateLimiter } from "../../utils/rateLimit";

// Booking and paying for appointments. Mounted at /bookings; signed-in customers only.
const router = Router();

router.use(authenticate);

// Each booking holds a slot, and each payment start creates a Stripe payment: keep scripts from flooding either.
const createLimiter = createRateLimiter("booking-create", 60 * 1000, 10);
const payLimiter = createRateLimiter("booking-pay", 60 * 1000, 20);

// Changing a booking moves money or the calendar.
const changeLimiter = createRateLimiter("booking-change", 60 * 1000, 20);

router.get("/", bookings.listBookings);
router.post("/", createLimiter, bookings.createBooking);
router.get("/:orderId", bookings.getBooking);
router.post("/:orderId/pay", payLimiter, bookings.pay);
router.post("/:orderId/pay/complete", payLimiter, bookings.completePayment);
router.post("/:orderId/abandon", bookings.abandon);
router.post("/:orderId/cancel", changeLimiter, bookings.cancel);
router.post("/:orderId/reschedule", changeLimiter, bookings.reschedule);
router.post("/:orderId/restore", changeLimiter, bookings.restore);
router.post("/:orderId/confirm-availability", changeLimiter, bookings.confirmAttendance);
router.post("/:orderId/review", changeLimiter, bookings.review);

export default router;
