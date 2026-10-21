import crypto from "node:crypto";
import prisma from "../../lib/prisma/prisma";
import redis from "../../lib/redis/redis";
import { Prisma } from "../../generated/prisma/client";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { googleIdentity, googleSignInConfigured, googleSignInUrl, pkcePair, type GoogleIdentity } from "../../lib/googleSignIn";
import { AppError } from "../../middlewares/centralAppError";
import { loginAlertEmail } from "../../emails";
import type { SessionRole } from "../../utils/authCookies";
import { announceNewMerchant } from "../merchant/auth/merchantSignupService";
import { notifyUser } from "../notificationsService";
import { completeReferral, generateUniqueReferralCode } from "../referralService";
import { CUSTOMER_PROFILE_SELECT, SITE_ACCESS, displayName, findUserByEmail, suspendedError } from "./accountAccess";
import { openSession, type SessionResult } from "./sessionService";
import { announceNewCustomer } from "./signupService";

// "Continue with Google" for customers and business owners. Google vouches for
// the email address, so it signs in the account with that email (the same
// access rules as a password login), or creates one. The round trip carries a
// single-use state, tied to the browser that started it, plus PKCE.

const TTL_SECONDS = 10 * 60;
const key = (state: string) => `google-login:${state}`;

interface Pending { role: SessionRole; redirect: string | null; ref: string | null; verifier: string; browser: string }

/** Starts the round trip: Google's sign-in URL, and the token the browser keeps (as a cookie) to finish it. */
export async function startGoogleSignIn(input: { role: SessionRole; redirect: string | null; ref: string | null }): Promise<{ url: string; browser: string }> {
  if (!googleSignInConfigured()) throw new AppError("Signing in with Google isn't available right now.", 503, "GOOGLE_NOT_CONFIGURED");
  const state = crypto.randomBytes(24).toString("base64url");
  const browser = crypto.randomBytes(24).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const pending: Pending = { ...input, verifier, browser };
  await redis.set(key(state), JSON.stringify(pending), "EX", TTL_SECONDS);
  return { url: googleSignInUrl(state, challenge), browser };
}

export interface GoogleSignInResult {
  role: SessionRole;
  redirect: string | null;
  session: SessionResult;
  created: boolean;
}

/** Who started this round trip (for where to send them if it fails); null when the state is unknown or used. */
export async function claimPending(state: string, browser: string | undefined): Promise<Pending | null> {
  if (!state) return null;
  const raw = await redis.getdel(key(state));
  if (!raw) return null;
  const pending = JSON.parse(raw) as Pending;
  // Started in another browser (or the cookie is missing): not this visitor's sign-in.
  if (!browser || browser.length !== pending.browser.length || !crypto.timingSafeEqual(Buffer.from(browser), Buffer.from(pending.browser))) return null;
  return pending;
}

/** Finishes it with the code Google returned. */
export async function finishGoogleSignIn(pending: Pending, code: string): Promise<GoogleSignInResult> {
  let identity: GoogleIdentity;
  try {
    identity = await googleIdentity(code, pending.verifier);
  } catch {
    throw AppError.badRequest("We couldn't sign you in with Google. Please try again.", "GOOGLE_FAILED");
  }
  if (!identity.emailVerified) throw AppError.forbidden("Your Google account's email address isn't verified.", "GOOGLE_EMAIL_UNVERIFIED");

  const role = pending.role;
  const existing = await findUserByEmail(identity.email);
  // Someone who started signing up by email but never finished: Google finishes it, as the role chosen now.
  const unfinished = !!existing && !existing.password && !existing.firstName;

  if (existing && !unfinished) {
    if (existing.isSuspended) throw suspendedError();
    const accessError = SITE_ACCESS[role](existing);
    if (accessError) throw accessError;
    const now = new Date();
    await prisma.user.update({
      where: { id: existing.id },
      data: { activity: now.toISOString(), isVerified: true, firstName: existing.firstName ?? identity.firstName, surname: existing.surname ?? identity.lastName, updatedAt: now },
    });
    sendEmailInBackground({ to: existing.email, ...loginAlertEmail({ name: displayName(existing), at: now }) });
    notifyUser(existing.id, { title: "Logged In", message: "You have logged in successfully." });
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: existing.id }, select: CUSTOMER_PROFILE_SELECT });
    return { role, redirect: pending.redirect, session: await openSession(profile, role), created: false };
  }

  if (existing?.isSuspended) throw suspendedError();
  const profile = await createAccount(identity, role, existing?.id ?? null);
  if (role === "customer") {
    await completeReferral(profile, pending.ref ?? undefined);
    announceNewCustomer(profile);
  } else {
    announceNewMerchant(profile);
  }
  return { role, redirect: pending.redirect, session: await openSession(profile, role), created: true };
}

/** A new account for this Google identity (or the unfinished sign-up row it completes). */
async function createAccount(identity: GoogleIdentity, role: SessionRole, unfinishedId: string | null) {
  const roleFlags = role === "merchant" ? { isMerchant: true, isCustomer: false, isStaff: false } : { isCustomer: true };
  const data = {
    firstName: identity.firstName,
    surname: identity.lastName,
    isVerified: true,
    ...roleFlags,
    ...(role === "customer" ? { referralCode: await generateUniqueReferralCode() } : {}),
    updatedAt: new Date(),
  };
  try {
    const user = unfinishedId
      ? await prisma.user.update({ where: { id: unfinishedId }, data, select: CUSTOMER_PROFILE_SELECT })
      : await prisma.user.create({ data: { email: identity.email, ...data }, select: CUSTOMER_PROFILE_SELECT });
    return user;
  } catch (err) {
    // Two sign-ins at once: the other one created it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw AppError.conflict("Your account was just created. Please continue with Google again.", "GOOGLE_RETRY");
    throw err;
  }
}
