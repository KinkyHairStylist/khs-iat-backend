import { Router } from "express";

// Unclassified — customer sign-up and sessions; password reset (customers and merchants).
import authRouter from "./authRouter";
import { customerNotificationsRouter, merchantNotificationsRouter } from "./notificationsRouter";
import supportRouter from "./supportRouter";
import helpRouter from "./helpRouter";

// Customer — one router per domain under ./customer, ported from
// Kinky-Hair-Stylist-BE-Redesign.
import landingRouter from "./customer/landingRouter";
import salonsRouter from "./customer/salonsRouter";
import alertsRouter from "./customer/alertsRouter";
import accountRouter from "./customer/accountRouter";
import bookingsRouter from "./customer/bookingsRouter";
import purchasesRouter from "./customer/purchasesRouter";
import profileRouter from "./customer/profileRouter";
import settingsRouter from "./customer/settingsRouter";
import billingRouter from "./customer/billingRouter";

// Merchant — one router per domain under ./merchant.
import merchantAuthRouter from "./merchant/authRouter";
import merchantSetupRouter from "./merchant/setupRouter";
import merchantDashboardRouter from "./merchant/dashboardRouter";
import merchantBookingsRouter from "./merchant/bookingsRouter";
import merchantServicesRouter from "./merchant/servicesRouter";

const router = Router();

router.use("/auth", authRouter);
router.use("/notifications", customerNotificationsRouter);
router.use("/support", supportRouter);

// Public (no session).
router.use("/landing", landingRouter);
router.use("/salons", salonsRouter);
router.use("/alerts", alertsRouter);
router.use("/help", helpRouter);

// Signed-in customer.
router.use("/customer", accountRouter);
router.use("/customer", purchasesRouter);
router.use("/customer", profileRouter);
router.use("/customer", settingsRouter);
router.use("/customer", billingRouter);
router.use("/bookings", bookingsRouter);

// Merchant.
router.use("/merchant/auth", merchantAuthRouter);
router.use("/merchant/notifications", merchantNotificationsRouter);
router.use("/merchant", merchantSetupRouter);
router.use("/merchant", merchantDashboardRouter);
router.use("/merchant", merchantBookingsRouter);
router.use("/merchant", merchantServicesRouter);

export default router;
