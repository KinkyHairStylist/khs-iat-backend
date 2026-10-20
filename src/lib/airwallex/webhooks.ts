import crypto from "node:crypto";
import { AIRWALLEX_WEBHOOK_SECRET } from "../../config/env";

// Older than this and the request is refused, so a captured one can't be replayed.
const MAX_AGE_MS = 5 * 60_000;

/** Checks an Airwallex webhook: HMAC-SHA256 of x-timestamp + raw body, hex. Throws when it doesn't match. */
export function verifyAirwallexWebhook(rawBody: Buffer, timestamp: string | undefined, signature: string | undefined): void {
  if (!AIRWALLEX_WEBHOOK_SECRET) throw new Error("AIRWALLEX_WEBHOOK_SECRET is not set");
  if (!timestamp || !signature) throw new Error("Missing x-timestamp/x-signature headers");
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > MAX_AGE_MS) throw new Error("Timestamp outside the allowed window");

  const expected = crypto.createHmac("sha256", AIRWALLEX_WEBHOOK_SECRET).update(timestamp + rawBody.toString("utf8")).digest();
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new Error("Signature mismatch");
}
