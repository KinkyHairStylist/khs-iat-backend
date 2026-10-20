import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/env";
import redis from "../redis/redis";
import { AppError } from "../../middlewares/centralAppError";

// The `state` that round-trips through Google/Zoho's sign-in: signed (with a
// key separate from login tokens), tied to the salon and owner that started it,
// 15 minutes long, and usable once.

export type OAuthProvider = "google-calendar" | "zohobooks";

const SECRET = `${JWT_SECRET}:integration-oauth`;
const TTL_SECONDS = 15 * 60;
const invalid = () => AppError.badRequest("The connection request expired or is invalid. Please try connecting again.", "OAUTH_STATE_INVALID");

export function signState(provider: OAuthProvider, businessId: string, ownerId: string): string {
  return jwt.sign({ purpose: "integration-oauth", provider, businessId, ownerId }, SECRET, { expiresIn: TTL_SECONDS, jwtid: crypto.randomUUID() });
}

/** The salon the owner started connecting; throws if forged, expired, reused, for another provider or another owner. */
export async function consumeState(provider: OAuthProvider, state: string, ownerId: string): Promise<string> {
  let payload: jwt.JwtPayload & { purpose?: string; provider?: string; businessId?: string; ownerId?: string };
  try {
    payload = jwt.verify(state, SECRET) as typeof payload;
  } catch {
    throw invalid();
  }
  if (payload.purpose !== "integration-oauth" || payload.provider !== provider || payload.ownerId !== ownerId || !payload.businessId || !payload.jti) throw invalid();
  if (!(await redis.set(`oauth-state:${payload.jti}`, "1", "EX", TTL_SECONDS, "NX"))) throw invalid();
  return payload.businessId;
}
