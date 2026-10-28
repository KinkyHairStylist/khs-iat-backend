import { Router } from "express";
import * as landingController from "../../controllers/customer/landingController";
import { createRateLimiter } from "../../utils/rateLimit";

// Public — the landing page's content. No session needed.
const router = Router();

// Stops one visitor filling the subscriber list with made-up addresses.
const newsletterLimiter = createRateLimiter("newsletter", 60 * 60 * 1000, 5);
// Both waitlist steps, plus going back to fix the email, from one visitor.
const waitlistLimiter = createRateLimiter("waitlist", 15 * 60 * 1000, 20);

router.get("/statistics", landingController.getStats);
router.get("/testimonials", landingController.getTestimonials);
router.get("/blog", landingController.getBlogPosts);
router.get("/blog/:slug", landingController.getBlogPost);
router.get("/faq", landingController.getFaqs);
router.get("/stories", landingController.getStories);
router.post("/newsletter/subscribe", newsletterLimiter, landingController.subscribeNewsletter);
router.post("/waitlist", waitlistLimiter, landingController.joinWaitlist);

export default router;
