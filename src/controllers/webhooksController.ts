import { Request, Response } from "express";
import { verifyAirwallexWebhook } from "../lib/airwallex/webhooks";
import redis from "../lib/redis/redis";
import { notifySlack } from "../lib/slack";
import { verifyStripeEvent } from "../lib/stripe/webhooks";
import { handleAirwallexEvent, type AirwallexEvent } from "../services/webhooks/airwallexEvents";
import { handleStripeEvent } from "../services/webhooks/stripeEvents";
import { getServiceLogger } from "../utils/loggerCreator";

const logger = getServiceLogger("webhooks");

// Stripe and Airwallex call these with a signed raw body. An unsigned or
// tampered request is refused (400, nothing done). An event is handled once:
// a redelivery while it's running, or after it succeeded, is acknowledged and
// skipped. A handler that fails answers 500 so the provider retries it later;
// the Kinky-Hair-Stylist backend answered 200, which dropped the event for good.

const DONE_SECONDS = 7 * 24 * 3600;
const RUNNING_SECONDS = 120;

async function runOnce(provider: string, eventId: string, label: string, handle: () => Promise<void>, res: Response): Promise<void> {
  const key = `webhook:${provider}:${eventId}`;
  if (!(await redis.set(key, "running", "EX", RUNNING_SECONDS, "NX"))) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }
  try {
    await handle();
    await redis.set(key, "done", "EX", DONE_SECONDS);
    res.status(200).json({ received: true });
  } catch (err) {
    await redis.del(key);
    const error = (err as Error).message;
    logger.error("Webhook handler failed", { provider, eventId, label, error });
    notifySlack({
      node: "Payment",
      severity: "CRITICAL",
      type: "ERROR_ALERT",
      trigger: `${provider} webhook failed: ${label}`,
      body: `• ${provider} will retry this event, but until it succeeds its effect (settling a payment, a plan status, a payout) hasn't happened.\n• Event: ${eventId}\n• Error: ${error}`,
    });
    res.status(500).json({ received: false });
  }
}

function refuse(provider: string, err: unknown, res: Response): void {
  const error = (err as Error).message;
  logger.warn("Webhook signature check failed", { provider, error });
  notifySlack({
    node: "Payment",
    severity: "ERROR",
    type: "ERROR_ALERT",
    trigger: `${provider} webhook signature check failed`,
    body: `• A request to the ${provider} webhook was refused (wrong secret configured, or not from ${provider}).\n• Error: ${error}`,
  });
  res.status(400).json({ received: false });
}

const rawBody = (req: Request): Buffer => (Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));

export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  let event;
  try {
    event = verifyStripeEvent(rawBody(req), req.header("stripe-signature"));
  } catch (err) {
    return refuse("Stripe", err, res);
  }
  await runOnce("Stripe", event.id, event.type, () => handleStripeEvent(event), res);
}

export async function airwallexWebhook(req: Request, res: Response): Promise<void> {
  const body = rawBody(req);
  try {
    verifyAirwallexWebhook(body, req.header("x-timestamp"), req.header("x-signature"));
  } catch (err) {
    return refuse("Airwallex", err, res);
  }
  let event: AirwallexEvent;
  try {
    event = JSON.parse(body.toString("utf8")) as AirwallexEvent;
  } catch {
    res.status(400).json({ received: false });
    return;
  }
  const eventId = event.id ?? `${event.name}:${event.data?.id}`;
  await runOnce("Airwallex", eventId, event.name ?? "unknown", () => handleAirwallexEvent(event), res);
}
