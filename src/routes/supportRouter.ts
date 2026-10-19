import { Router } from "express";
import * as support from "../controllers/supportController";
import { authenticate } from "../middlewares/authenticate";
import { createRateLimiter } from "../utils/rateLimit";

// The signed-in customer's support chat. Mounted at /support.
const router = Router();

router.use(authenticate);

// Generous for a real conversation; stops scripted floods (and image spam).
const sendLimiter = createRateLimiter("support-send", 60 * 1000, 30);
const ticketLimiter = createRateLimiter("support-ticket", 60 * 60 * 1000, 10);

router.get("/staff", support.staff);
router.get("/tickets/open", support.openTickets);
router.get("/tickets/history", support.history);
router.post("/tickets", ticketLimiter, support.createTicket);
router.get("/tickets/:id/messages", support.ticketMessages);
router.patch("/tickets/:id/read", support.markRead);
router.patch("/tickets/:id/close", support.closeTicket);
// Sends into the named conversation (or the only open one, opening one if needed).
router.post("/messages", sendLimiter, support.sendMessage);

export default router;
