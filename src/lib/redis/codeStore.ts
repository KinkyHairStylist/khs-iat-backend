import crypto from "crypto";
import redis from "./redis";
import { JWT_SECRET } from "../../config/env";
import { AppError } from "../../middlewares/centralAppError";

// One-time codes (the 5-digit codes emailed for sign-up and password reset)
// and one-time tickets (what a verified code is exchanged for, so the next
// step can prove the code was entered). Both live only in Redis.
//
// Codes are stored as an HMAC keyed with the server secret, never in plain
// text — a Redis dump can't be used, and 5 digits can't be brute-forced
// offline without the key. Each code allows MAX_ATTEMPTS guesses, then it is
// gone and a new one must be requested.
//
//   customer-code:<purpose>:<subject>          -> hash { h: hmac, a: attempts }
//   customer-code-cooldown:<purpose>:<subject> -> "1"   (resend wait)
//   customer-ticket:<kind>:<sha256(ticket)>    -> JSON payload

export const CODE_TTL_MINUTES = 10;
const CODE_RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const codeKey = (purpose: string, subject: string) => `customer-code:${purpose}:${subject}`;
const cooldownKey = (purpose: string, subject: string) => `customer-code-cooldown:${purpose}:${subject}`;
const ticketKey = (kind: string, ticket: string) =>
  `customer-ticket:${kind}:${crypto.createHash("sha256").update(ticket).digest("hex")}`;

function codeHmac(purpose: string, subject: string, code: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update(`${purpose}:${subject}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Issues a new 5-digit code for `subject` (an email address), replacing any
 * earlier one. Refuses with 429 if one was sent less than a minute ago.
 */
export async function issueCode(purpose: string, subject: string): Promise<string> {
  // NX: only the first request in the window gets through, even if two race.
  const allowed = await redis.set(cooldownKey(purpose, subject), "1", "EX", CODE_RESEND_SECONDS, "NX");
  if (allowed !== "OK") {
    const wait = Math.max(1, await redis.ttl(cooldownKey(purpose, subject)));
    throw new AppError(
      `We've just sent you a code. Please wait ${wait} second${wait === 1 ? "" : "s"} before asking for another.`,
      429,
      "CODE_COOLDOWN"
    );
  }

  const code = crypto.randomInt(10_000, 100_000).toString();
  const key = codeKey(purpose, subject);
  await redis
    .multi()
    .del(key)
    .hset(key, { h: codeHmac(purpose, subject, code), a: 0 })
    .expire(key, CODE_TTL_MINUTES * 60)
    .exec();
  return code;
}

/** Lets the caller send the code again straight away (e.g. the email failed to send). */
export async function clearCodeCooldown(purpose: string, subject: string): Promise<void> {
  await redis.del(cooldownKey(purpose, subject));
}

/**
 * Checks a code. Correct: the code is used up and this resolves. Wrong,
 * expired or out of attempts: throws a 400 the customer can act on.
 */
export async function verifyCode(purpose: string, subject: string, code: string): Promise<void> {
  const key = codeKey(purpose, subject);
  // Count the attempt before comparing, atomically, so parallel guesses can't
  // get more than MAX_ATTEMPTS tries between them.
  const [[, attempts], [, stored]] = (await redis.multi().hincrby(key, "a", 1).hget(key, "h").exec()) as [
    [Error | null, number],
    [Error | null, string | null],
  ];

  if (!stored) {
    await redis.del(key); // HINCRBY created an empty hash for a missing code.
    throw AppError.badRequest("This code has expired. Please request a new one.", "CODE_EXPIRED");
  }
  if (attempts > MAX_ATTEMPTS) {
    await redis.del(key);
    throw AppError.badRequest("Too many incorrect attempts. Please request a new code.", "CODE_ATTEMPTS_EXCEEDED");
  }
  if (!sameHash(stored, codeHmac(purpose, subject, code))) {
    const left = MAX_ATTEMPTS - attempts;
    throw AppError.badRequest(
      left > 0
        ? `That code isn't right. You have ${left} attempt${left === 1 ? "" : "s"} left.`
        : "That code isn't right. Please request a new code.",
      "CODE_INVALID"
    );
  }

  await redis.del(key);
}

/** A single-use, unguessable ticket carrying `payload`, valid for `ttlMinutes`. */
export async function issueTicket<T>(kind: string, payload: T, ttlMinutes: number): Promise<string> {
  const ticket = crypto.randomBytes(32).toString("base64url");
  await redis.setex(ticketKey(kind, ticket), ttlMinutes * 60, JSON.stringify(payload));
  return ticket;
}

/**
 * A ticket's payload, or null if it is unknown, used or expired. The ticket
 * stays valid: call discardTicket once the step it allows has succeeded, so a
 * failure part-way (a database error) doesn't make the customer start over.
 * The step itself must be safe to attempt twice.
 */
export async function readTicket<T>(kind: string, ticket: string): Promise<T | null> {
  const raw = await redis.get(ticketKey(kind, ticket));
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function discardTicket(kind: string, ticket: string): Promise<void> {
  await redis.del(ticketKey(kind, ticket));
}
