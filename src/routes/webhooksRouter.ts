import express, { Router } from "express";
import { airwallexWebhook, stripeWebhook } from "../controllers/webhooksController";

// Mounted in app.ts ahead of the JSON parser and the browser guards (CSRF,
// content type, global rate limit): the signature is checked over the exact
// bytes sent, and these callers are Stripe and Airwallex, not a browser.
const router = Router();
const raw = express.raw({ type: "*/*", limit: "1mb" });

router.post("/stripe", raw, stripeWebhook);
router.post("/airwallex", raw, airwallexWebhook);

export default router;
