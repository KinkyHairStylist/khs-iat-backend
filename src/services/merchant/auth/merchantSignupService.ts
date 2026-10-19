import bcrypt from "bcryptjs";
import prisma from "../../../lib/prisma/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { AppError } from "../../../middlewares/centralAppError";
import { CODE_TTL_MINUTES, clearCodeCooldown, discardTicket, issueCode, issueTicket, readTicket, verifyCode } from "../../../lib/redis/codeStore";
import { sendEmail, sendEmailInBackground } from "../../../lib/emailEngine/sendgrid";
import { notifySlack } from "../../../lib/slack";
import { merchantWelcomeEmail, verificationCodeEmail } from "../../../emails";
import { DELIVERY_TEAM_EMAIL } from "../../../config/env";
import type { MerchantSignupInput } from "../../../schemas/merchant/auth.schema";
import type { VerifyCodeInput } from "../../../schemas/auth.schema";
import { BCRYPT_ROUNDS, CUSTOMER_PROFILE_SELECT, displayName, findUserByEmail } from "../../auth/accountAccess";
import { openSession, type SessionResult } from "../../auth/sessionService";

// Merchant sign-up in three steps, like a customer's: email → code → details.
// Codes and tickets are kept apart from the customer ones, so a customer
// sign-up code can never complete a merchant sign-up.

const CODE_PURPOSE = "merchant-signup";
const TICKET_KIND = "merchant-signup";
const TICKET_MINUTES = 30;
const SIGNUP_EXPIRED = "Your sign-up session has expired. Please start again with your email.";
// As before, one email is one account: a customer email can't become a business account here.
const EMAIL_TAKEN = "An account with this email already exists. Please log in, or use another email for your business.";
const PHONE_TAKEN = "This phone number is already used by another account. Please use a different one.";

/** Step 1 (and "resend code"): emails a 5-digit code to verify the address. */
export async function startMerchantSignup(email: string): Promise<void> {
  const existing = await findUserByEmail(email);
  if (existing?.password) throw AppError.conflict(EMAIL_TAKEN, "ACCOUNT_EXISTS");

  const code = await issueCode(CODE_PURPOSE, email);
  try {
    await sendEmail({ to: email, ...verificationCodeEmail({ code, purpose: "verification", expiresInMinutes: CODE_TTL_MINUTES }) });
  } catch (err) {
    await clearCodeCooldown(CODE_PURPOSE, email);
    throw err;
  }
}

/** Step 2: checks the code; returns the single-use token step 3 must present. */
export async function verifyMerchantSignupCode({ email, code }: VerifyCodeInput): Promise<{ signupToken: string }> {
  await verifyCode(CODE_PURPOSE, email, code);

  let user = await findUserByEmail(email);
  if (user?.password) throw AppError.conflict(EMAIL_TAKEN, "ACCOUNT_EXISTS");
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
    await prisma.user.update({ where: { id: user.id }, data: { isVerified: true, updatedAt: new Date() } });
  }

  return { signupToken: await issueTicket(TICKET_KIND, { userId: user.id }, TICKET_MINUTES) };
}

/** Step 3: sets the password and details on a merchant account, then signs the merchant in. */
export async function completeMerchantSignup(input: MerchantSignupInput): Promise<SessionResult> {
  const ticket = await readTicket<{ userId: string }>(TICKET_KIND, input.signupToken);
  if (!ticket) throw AppError.badRequest(SIGNUP_EXPIRED, "SIGNUP_EXPIRED");

  const phoneOwner = await prisma.user.findFirst({ where: { phoneNumber: input.phoneNumber, NOT: { id: ticket.userId } }, select: { id: true } });
  if (phoneOwner) throw AppError.conflict(PHONE_TAKEN, "PHONE_TAKEN");

  // "password: null" in the filter: if two submissions race, only one sets it.
  const { count } = await prisma.user.updateMany({
    where: { id: ticket.userId, password: null },
    data: {
      password: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      firstName: input.firstName,
      surname: input.surname,
      phoneNumber: input.phoneNumber,
      gender: input.gender,
      isVerified: true,
      isMerchant: true,
      isCustomer: false,
      isStaff: false,
      updatedAt: new Date(),
    },
  });
  await discardTicket(TICKET_KIND, input.signupToken);
  if (count === 0) throw AppError.conflict(EMAIL_TAKEN, "ACCOUNT_EXISTS");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: ticket.userId }, select: CUSTOMER_PROFILE_SELECT });
  announceNewMerchant(user);
  return openSession(user, "merchant");
}

/** Welcome email and the Slack alert — neither holds up sign-up. */
function announceNewMerchant(user: { id: string; email: string; firstName: string | null; surname: string | null; phoneNumber: string | null }): void {
  const name = displayName(user) === "Customer" ? "Merchant" : displayName(user);
  sendEmailInBackground({ to: user.email, cc: DELIVERY_TEAM_EMAIL || undefined, ...merchantWelcomeEmail({ name }) });
  notifySlack({
    node: "User Management",
    type: "USER_REGISTRATION",
    trigger: `${name} <${user.email}>`,
    body: `New merchant signed up
      • User ID: ${user.id}
      • Name: ${[user.firstName, user.surname].filter(Boolean).join(" ")}
      • Email: ${user.email}
      • Phone: ${user.phoneNumber || "N/A"}`,
  });
}
