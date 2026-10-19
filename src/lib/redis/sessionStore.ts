import crypto from "crypto";
import redis from "./redis";
import { REFRESH_TOKEN_TTL_DAYS } from "../../config/env";

// Customer sessions. Each login creates a session (sid) with one live refresh
// token. Every refresh rotates it: the presented token is retired and a new
// one issued. Presenting a retired token again means it was copied, so the
// whole session is revoked (refresh-token reuse detection).
//
// Only SHA-256 hashes of refresh tokens are stored — a Redis dump can't be
// replayed.
//
// Keys are prefixed "customer-" so a Redis shared with khs-iat-staff-be never
// mixes the two apps' sessions.
//
//   customer-session:<sid>          -> userId              (session is active)
//   customer-user-sessions:<userId> -> set of sid          (for "log out everywhere")
//   customer-rt:<sha256(token)>     -> JSON RefreshRecord

const SESSION_PREFIX = "customer-session:";
const USER_SESSIONS_PREFIX = "customer-user-sessions:";
const REFRESH_PREFIX = "customer-rt:";

const SESSION_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
// Two tabs (or a retried request) can refresh with the same token at nearly
// the same moment. Inside this window a just-rotated token still yields a new
// access token (but no new refresh token) instead of tripping reuse detection.
const ROTATION_GRACE_SECONDS = 30;

// SET key to ARGV[2] (with TTL ARGV[3]) only if it still holds ARGV[1].
// Works on any Redis version (SET ... GET with XX needs Redis 7).
const COMPARE_AND_SET = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`;

interface RefreshRecord {
  userId: string;
  sid: string;
  /** Set once this token has been exchanged for a newer one. */
  rotatedAt?: number;
}

export interface SessionTokens {
  sid: string;
  refreshToken: string;
}

export type RefreshOutcome =
  | { status: "rotated"; userId: string; sid: string; refreshToken: string }
  | { status: "grace"; userId: string; sid: string }
  | { status: "invalid" };

function hash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

async function storeRefreshToken(userId: string, sid: string): Promise<string> {
  const refreshToken = newRefreshToken();
  const record: RefreshRecord = { userId, sid };
  await redis.setex(REFRESH_PREFIX + hash(refreshToken), SESSION_TTL_SECONDS, JSON.stringify(record));
  return refreshToken;
}

export async function createSession(userId: string): Promise<SessionTokens> {
  const sid = crypto.randomUUID();

  await redis
    .multi()
    .setex(SESSION_PREFIX + sid, SESSION_TTL_SECONDS, userId)
    .sadd(USER_SESSIONS_PREFIX + userId, sid)
    .expire(USER_SESSIONS_PREFIX + userId, SESSION_TTL_SECONDS)
    .exec();

  const refreshToken = await storeRefreshToken(userId, sid);
  return { sid, refreshToken };
}

export async function isSessionActive(sid: string, userId: string): Promise<boolean> {
  return (await redis.get(SESSION_PREFIX + sid)) === userId;
}

export async function rotateRefreshToken(refreshToken: string): Promise<RefreshOutcome> {
  const key = REFRESH_PREFIX + hash(refreshToken);
  const raw = await redis.get(key);
  if (!raw) return { status: "invalid" };

  const record = JSON.parse(raw) as RefreshRecord;
  if (!(await isSessionActive(record.sid, record.userId))) return { status: "invalid" };

  if (record.rotatedAt) {
    if (Date.now() - record.rotatedAt <= ROTATION_GRACE_SECONDS * 1000) {
      return { status: "grace", userId: record.userId, sid: record.sid };
    }
    // A retired token came back after the grace window: treat it as stolen.
    await revokeSession(record.sid, record.userId);
    return { status: "invalid" };
  }

  // Retire the presented token atomically — if two requests race past the
  // GET above, only one wins the compare-and-set and issues a new refresh token.
  const retired: RefreshRecord = { ...record, rotatedAt: Date.now() };
  const won = await redis.eval(COMPARE_AND_SET, 1, key, raw, JSON.stringify(retired), SESSION_TTL_SECONDS);
  if (won !== 1) {
    return { status: "grace", userId: record.userId, sid: record.sid };
  }

  // Sliding session: each refresh extends it.
  await redis
    .multi()
    .expire(SESSION_PREFIX + record.sid, SESSION_TTL_SECONDS)
    .expire(USER_SESSIONS_PREFIX + record.userId, SESSION_TTL_SECONDS)
    .exec();

  const next = await storeRefreshToken(record.userId, record.sid);
  return { status: "rotated", userId: record.userId, sid: record.sid, refreshToken: next };
}

/** Logs one session out. Its refresh tokens die with it (rotateRefreshToken checks the session). */
export async function revokeSession(sid: string, userId: string): Promise<void> {
  await redis.multi().del(SESSION_PREFIX + sid).srem(USER_SESSIONS_PREFIX + userId, sid).exec();
}

/** Logs a user out everywhere — on a password reset or change. */
export async function revokeAllSessions(userId: string): Promise<void> {
  const sids = await redis.smembers(USER_SESSIONS_PREFIX + userId);
  const tx = redis.multi();
  for (const sid of sids) tx.del(SESSION_PREFIX + sid);
  tx.del(USER_SESSIONS_PREFIX + userId);
  await tx.exec();
}

/** Logs a user out on every other device (a password change keeps the current session). */
export async function revokeOtherSessions(userId: string, keepSid: string): Promise<void> {
  const sids = (await redis.smembers(USER_SESSIONS_PREFIX + userId)).filter((sid) => sid !== keepSid);
  if (!sids.length) return;
  const tx = redis.multi();
  for (const sid of sids) tx.del(SESSION_PREFIX + sid);
  tx.srem(USER_SESSIONS_PREFIX + userId, ...sids);
  await tx.exec();
}
