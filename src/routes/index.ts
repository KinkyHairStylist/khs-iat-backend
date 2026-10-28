import { Router } from "express";

// Unclassified — customer sign-up and sessions; password reset (customers and merchants).
import authRouter from "./authRouter";
import { customerNotificationsRouter, merchantNotificationsRouter } from "./notificationsRouter";
import supportRouter from "./supportRouter";
import helpRouter from "./helpRouter";
import waitlistRouter from "./waitlistRouter";

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
import merchantStaffRouter from "./merchant/staffRouter";
import merchantClientsRouter from "./merchant/clientsRouter";
import merchantWalletRouter from "./merchant/walletRouter";
import merchantGiftCardsRouter from "./merchant/giftCardsRouter";
import merchantMembershipsRouter from "./merchant/membershipsRouter";
import merchantBillingRouter from "./merchant/billingRouter";
import merchantSettingsRouter from "./merchant/settingsRouter";
import merchantIntegrationsRouter from "./merchant/integrationsRouter";

const router = Router();

router.use("/auth", authRouter);
router.use("/notifications", customerNotificationsRouter);
router.use("/support", supportRouter);

// Public (no session).
router.use("/landing", landingRouter);
router.use("/salons", salonsRouter);
router.use("/alerts", alertsRouter);
router.use("/help", helpRouter);
router.use("/waitlist", waitlistRouter);

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
router.use("/merchant", merchantStaffRouter);
router.use("/merchant", merchantClientsRouter);
router.use("/merchant", merchantWalletRouter);
router.use("/merchant", merchantGiftCardsRouter);
router.use("/merchant", merchantMembershipsRouter);
router.use("/merchant", merchantBillingRouter);
router.use("/merchant", merchantSettingsRouter);
router.use("/merchant", merchantIntegrationsRouter);

export default router;
