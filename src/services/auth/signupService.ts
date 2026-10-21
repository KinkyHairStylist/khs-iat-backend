import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/centralAppError";
import { CODE_TTL_MINUTES, clearCodeCooldown, discardTicket, issueCode, issueTicket, readTicket, verifyCode } from "../../lib/redis/codeStore";
import { sendEmail, sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { notifySlack } from "../../lib/slack";
import { newCustomerTeamEmail, verificationCodeEmail, welcomeEmail } from "../../emails";
import { completeReferral, generateUniqueReferralCode, recordReferralIntent } from "../referralService";
import { DELIVERY_TEAM_EMAIL } from "../../config/env";
import type { GetStartedInput, SignupInput, VerifyCodeInput } from "../../schemas/auth.schema";
import { ACCOUNT_EXISTS_MESSAGE, BCRYPT_ROUNDS, CUSTOMER_PROFILE_SELECT, displayName, findUserByEmail } from "./accountAccess";
import { openSession, type SessionResult } from "./sessionService";

// Sign-up in three steps: email → code → details.

const CODE_PURPOSE = "signup";
const TICKET_KIND = "signup";
const TICKET_MINUTES = 30;
const SIGNUP_EXPIRED = "Your sign-up session has expired. Please start again with your email.";

/**
 * Step 1 (and "resend code"): emails a 5-digit code to verify the address.
 * A referral link's code is remembered for when sign-up completes.
 */
export async function startSignup({ email, refCode }: GetStartedInput): Promise<void> {
  if (refCode) await recordReferralIntent(refCode, email);

  const existing = await findUserByEmail(email);
  if (existing?.password) throw AppError.conflict(ACCOUNT_EXISTS_MESSAGE, "ACCOUNT_EXISTS");

  const code = await issueCode(CODE_PURPOSE, email);
  try {
    // Awaited: the customer is waiting on this email to go any further.
    await sendEmail({ to: email, ...verificationCodeEmail({ code, purpose: "verification", expiresInMinutes: CODE_TTL_MINUTES }) });
  } catch (err) {
    await clearCodeCooldown(CODE_PURPOSE, email); // let them try again straight away
    throw err;
  }
}

/**
 * Step 2: checks the code and marks the email verified. Returns a single-use
 * sign-up token that step 3 must present — only whoever entered the code can
 * set this account's password.
 */
export async function verifySignupCode({ email, code }: VerifyCodeInput): Promise<{ signupToken: string }> {
  await verifyCode(CODE_PURPOSE, email, code);

  let user = await findUserByEmail(email);
  if (user?.password) throw AppError.conflict(ACCOUNT_EXISTS_MESSAGE, "ACCOUNT_EXISTS");

  if (!user) {
    try {
      user = await prisma.user.create({ data: { email, isVerified: true } });
    } catch (err) {
      // The same email verified twice at once: use the row the other request made.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      user = await findUserByEmail(email);
      if (!user) throw err;
    }
  } else if (!user.isVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationCode: null, verificationExpires: null, updatedAt: new Date() },
    });
  }

  const signupToken = await issueTicket(TICKET_KIND, { userId: user.id }, TICKET_MINUTES);
  return { signupToken };
}

/** Step 3: sets the password and details, then signs the new customer in. */
export async function completeSignup(input: SignupInput): Promise<SessionResult> {
  const ticket = await readTicket<{ userId: string }>(TICKET_KIND, input.signupToken);
  if (!ticket) throw AppError.badRequest(SIGNUP_EXPIRED, "SIGNUP_EXPIRED");

  const current = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { referralCode: true } });
  if (!current) throw AppError.badRequest(SIGNUP_EXPIRED, "SIGNUP_EXPIRED");

  // "password: null" in the filter: if two submissions race, only one sets it.
  const { count } = await prisma.user.updateMany({
    where: { id: ticket.userId, password: null },
    data: {
      password: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      firstName: input.firstName,
      surname: input.surname,
      phoneNumber: input.phoneNumber,
      gender: input.gender,
      referralCode: current.referralCode ?? (await generateUniqueReferralCode()),
      isVerified: true,
      updatedAt: new Date(),
    },
  });
  await discardTicket(TICKET_KIND, input.signupToken);
  if (count === 0) throw AppError.conflict(ACCOUNT_EXISTS_MESSAGE, "ACCOUNT_EXISTS");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: ticket.userId }, select: CUSTOMER_PROFILE_SELECT });

  await completeReferral(user, input.referralCode);
  announceNewCustomer(user);

  return openSession(user);
}

/** Welcome email, the team's notice and the Slack alert — none of them hold up sign-up. */
export function announceNewCustomer(user: { id: string; email: string; firstName: string | null; surname: string | null; phoneNumber: string | null }): void {
  const name = displayName(user);

  sendEmailInBackground({ to: user.email, cc: DELIVERY_TEAM_EMAIL || undefined, ...welcomeEmail({ name }) });
  if (DELIVERY_TEAM_EMAIL) {
    sendEmailInBackground({ to: DELIVERY_TEAM_EMAIL, ...newCustomerTeamEmail({ name, email: user.email, customerId: user.id }) });
  }
  notifySlack({
    node: "User Management",
    type: "USER_REGISTRATION",
    trigger: `${name} <${user.email}>`,
    body: `New customer signed up
      • User ID: ${user.id}
      • Name: ${[user.firstName, user.surname].filter(Boolean).join(" ")}
      • Email: ${user.email}
      • Phone: ${user.phoneNumber || "N/A"}`,
  });
}
