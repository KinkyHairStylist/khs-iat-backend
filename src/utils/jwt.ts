import jwt, { VerifyOptions } from "jsonwebtoken";
import { JWT_SECRET, ACCESS_TOKEN_TTL_MINUTES } from "../config/env";

const ISSUER = "khs-customer-be";
const AUDIENCE = "khs-customer";

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  role: string;
  /** Session id — the token is only honoured while this session is active in Redis. */
  sid: string;
  iat?: number;
  exp?: number;
}

const VERIFY_OPTIONS: VerifyOptions = {
  algorithms: ["HS256"],
  issuer: ISSUER,
  audience: AUDIENCE,
};

/** Short-lived access token. Only ever delivered in an httpOnly cookie. */
export function signAccessToken(payload: Pick<AccessTokenPayload, "sub" | "role" | "sid">): string {
  return jwt.sign({ role: payload.role, sid: payload.sid }, JWT_SECRET, {
    algorithm: "HS256",
    subject: payload.sub,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: ACCESS_TOKEN_TTL_MINUTES * 60,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, JWT_SECRET, VERIFY_OPTIONS) as AccessTokenPayload;
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
    throw new jwt.JsonWebTokenError("Malformed token");
  }
  return payload;
}
