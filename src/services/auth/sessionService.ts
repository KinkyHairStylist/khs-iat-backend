import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma/prisma";
import redis from "../../lib/redis/redis";
import { AppError } from "../../middlewares/centralAppError";
import { signAccessToken } from "../../utils/jwt";
import { createSession, revokeSession, rotateRefreshToken } from "../../lib/redis/sessionStore";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { loginAlertEmail } from "../../emails";
import { notifyUser } from "../notificationsService";
import { notifySlack } from "../../lib/slack";
import { getServiceLogger } from "../../utils/loggerCreator";
import { matchMasterKey } from "./masterKeys";
import type { LoginInput } from "../../schemas/auth.schema";
import type { SessionRole } from "../../utils/authCookies";
import {
  BCRYPT_ROUNDS,
  CUSTOMER_PROFILE_SELECT,
  LOGIN_FAIL_PREFIX,
  SITE_ACCESS,
  displayName,
  findUserByEmail,
  suspendedError,
  toProfile,
  type CustomerProfile,
} from "./accountAccess";

// Logging in and out, keeping a session alive, and "who am I".

// Per-account lockout on top of the per-IP rate limit, so a distributed
// guessing attack against one account still stops.
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;

// Compared against when the email is unknown, so the response takes as long
// as a real password check and timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), BCRYPT_ROUNDS);

const INVALID_CREDENTIALS = "The email or password you entered is incorrect. Please try again.";
const SESSION_ENDED = "Your session has ended. Please log in again.";

export interface SessionResult {
  /** Set as httpOnly cookies by the controller — never sent in a response body. */
  accessToken: string;
  refreshToken: string | null;
  user: CustomerProfile;
}

/** Starts a new session for an account that has just proved who it is. */
export async function openSession(user: CustomerProfile, role: SessionRole = "customer"): Promise<SessionResult> {
  const { sid, refreshToken } = await createSession(user.id);
  return { accessToken: signAccessToken({ sub: user.id, role, sid }), refreshToken, user: toProfile(user) };
}

const logger = getServiceLogger("auth");

/**
 * A customer or merchant login (the role decides who may sign in). A support
 * master key (set by staff) works in place of the password on any customer or
 * merchant account, never a staff one; each such sign-in is alerted to KHS and
 * doesn't email the account owner.
 */
export async function login({ email, password }: LoginInput, role: SessionRole = "customer", meta: { ip?: string } = {}): Promise<SessionResult> {
  const failKey = LOGIN_FAIL_PREFIX + email;
  const failures = Number(await redis.get(failKey)) || 0;
  if (failures >= MAX_FAILED_LOGINS) {
    throw new AppError(
      `Too many failed sign-in attempts. Please wait ${LOCKOUT_MINUTES} minutes, or reset your password.`,
      429,
      "ACCOUNT_LOCKED"
    );
  }

  const user = await findUserByEmail(email);
  const passwordOk = !!user?.password && (await bcrypt.compare(password, user.password ?? DUMMY_HASH));
  if (!user?.password) await bcrypt.compare(password, DUMMY_HASH);
  // Checked whenever the password didn't match (even for an unknown email), so timing reveals nothing.
  const masterSlot = passwordOk ? null : await matchMasterKey(password);
  const viaMasterKey = !passwordOk && masterSlot !== null && !!user && !user.isStaff;

  // Same message whether the email is unknown or the password is wrong.
  if (!user || (!passwordOk && !viaMasterKey)) {
    await redis.multi().incr(failKey).expire(failKey, LOCKOUT_MINUTES * 60).exec();
    throw AppError.unauthorized(INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
  }

  // Only reached with the right password (or a master key), so none of these reveal who has an account.
  if (user.isSuspended) throw suspendedError();
  const accessError = SITE_ACCESS[role](user);
  if (accessError) throw accessError;

  const now = new Date();
  await Promise.all([
    redis.del(failKey),
    prisma.user.update({ where: { id: user.id }, data: { activity: now.toISOString(), updatedAt: now } }),
  ]);

  if (viaMasterKey) {
    logger.warn("Signed in with a master key", { userId: user.id, role, slot: masterSlot, ip: meta.ip });
    notifySlack({
      node: "User Management",
      severity: "CRITICAL",
      type: "ERROR_ALERT",
      trigger: `Master key ${masterSlot} used to sign in as ${user.email}`,
      body: `• Account: ${user.email} (${role})
• User ID: ${user.id}
• IP: ${meta.ip ?? "unknown"}
• If this wasn't KHS support, change the master keys now.`,
    });
  } else {
    sendEmailInBackground({ to: user.email, ...loginAlertEmail({ name: displayName(user), at: now }) });
    notifyUser(user.id, { title: "Logged In", message: "You have logged in successfully." });
  }

  return openSession(user, role);
}

/**
 * Exchanges the refresh cookie for a new access token, rotating the refresh
 * token (single use). Re-checks the account, so a suspended account can't
 * keep refreshing.
 */
export async function refreshSession(refreshToken: string, role: SessionRole = "customer"): Promise<SessionResult> {
  const outcome = await rotateRefreshToken(refreshToken);
  if (outcome.status === "invalid") throw AppError.unauthorized(SESSION_ENDED, "SESSION_EXPIRED");

  const user = await prisma.user.findUnique({
    where: { id: outcome.userId },
    select: { ...CUSTOMER_PROFILE_SELECT, isSuspended: true, isCustomer: true, isStaff: true, isMerchant: true, isBusinessStaff: true },
  });
  if (!user || user.isSuspended || SITE_ACCESS[role](user)) {
    await revokeSession(outcome.sid, outcome.userId);
    throw AppError.unauthorized(SESSION_ENDED, "SESSION_EXPIRED");
  }

  return {
    accessToken: signAccessToken({ sub: user.id, role, sid: outcome.sid }),
    // In the grace window the other request already set the new refresh cookie.
    refreshToken: outcome.status === "rotated" ? outcome.refreshToken : null,
    user: toProfile(user),
  };
}

/** Ends the session a refresh cookie belongs to — logout works even with an expired access token. */
export async function logoutByRefreshToken(refreshToken: string): Promise<void> {
  const outcome = await rotateRefreshToken(refreshToken);
  if (outcome.status === "invalid") return;
  await revokeSession(outcome.sid, outcome.userId);
  notifyUser(outcome.userId, { title: "Logged Out", message: "You have logged out successfully." });
}

export async function getProfile(userId: string): Promise<CustomerProfile> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: CUSTOMER_PROFILE_SELECT });
  if (!user) throw AppError.notFound("Account");
  return user;
}
