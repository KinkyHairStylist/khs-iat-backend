import crypto from "node:crypto";
import { SETTINGS_ENCRYPTION_KEY } from "../../config/env";
import { AppError } from "../../middlewares/centralAppError";

// Integration tokens and keys at rest: AES-256-GCM with a random IV, stored as
// "iv:authTag:ciphertext" (base64) — the Kinky-Hair-Stylist backend's
// settings-encryption format and key, so either backend can read the other's.

const key = SETTINGS_ENCRYPTION_KEY ? Buffer.from(SETTINGS_ENCRYPTION_KEY, "base64") : null;

export const encryptionReady = (): boolean => !!key;

function requireKey(): Buffer {
  if (!key) throw new AppError("Connected apps aren't available right now.", 503, "INTEGRATIONS_NOT_CONFIGURED");
  return key;
}

export function seal(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", requireKey(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(":");
}

/** Throws on a tampered or malformed value. */
export function open(stored: string): string {
  const [iv, tag, body] = stored.split(":");
  if (!iv || !tag || !body) throw new Error("Malformed sealed value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", requireKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}
