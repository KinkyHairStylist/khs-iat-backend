import bcrypt from "bcryptjs";
import prisma from "../../lib/prisma/prisma";
import redis from "../../lib/redis/redis";
import { AppError } from "../../middlewares/centralAppError";
import { revokeAllSessions } from "../../lib/redis/sessionStore";
import { CODE_TTL_MINUTES, discardTicket, issueCode, issueTicket, readTicket, verifyCode } from "../../lib/redis/codeStore";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { passwordChangedEmail, verificationCodeEmail } from "../../emails";
import type { ResetFinishInput, ResetVerifyInput } from "../../schemas/auth.schema";
import { BCRYPT_ROUNDS, LOGIN_FAIL_PREFIX, canUseSite, customerAccessError, displayName, findUserByEmail } from "./accountAccess";

// Password reset in three steps: email → code → new password.

const CODE_PURPOSE = "reset";
const TICKET_KIND = "reset";
const TICKET_MINUTES = 15;
const RESET_STARTED = "If an account exists for this email, we've sent a code to reset the password.";

type ResettableUser = { password: string | null; isSuspended: boolean } & Parameters<typeof customerAccessError>[0];

function canReset(user: ResettableUser | null): boolean {
  return !!user?.password && !user.isSuspended && canUseSite(user);
}

/**
 * Always answers the same way, whether or not the email has an account, so it
 * can't be used to find out who is registered. The code (and its resend wait)
 * is issued for every email; only real customer accounts get it sent.
 */
export async function startPasswordReset(email: string): Promise<string> {
  const code = await issueCode(CODE_PURPOSE, email);

  const user = await findUserByEmail(email);
  if (user && canReset(user)) {
    sendEmailInBackground({
      to: user.email,
      ...verificationCodeEmail({ code, purpose: "password_reset", expiresInMinutes: CODE_TTL_MINUTES }),
    });
  }
  return RESET_STARTED;
}

/** Checks the reset code and returns a single-use token for setting the new password. */
export async function verifyPasswordResetCode({ email, code }: ResetVerifyInput): Promise<{ resetToken: string }> {
  await verifyCode(CODE_PURPOSE, email, code);

  const user = await findUserByEmail(email);
  if (!user || !canReset(user)) {
    throw AppError.badRequest("That code isn't right. Please request a new code.", "CODE_INVALID");
  }

  const resetToken = await issueTicket(TICKET_KIND, { userId: user.id, email }, TICKET_MINUTES);
  return { resetToken };
}

/** Sets the new password and signs the account out everywhere. */
export async function finishPasswordReset({ email, resetToken, newPassword }: ResetFinishInput): Promise<void> {
  const ticket = await readTicket<{ userId: string; email: string }>(TICKET_KIND, resetToken);
  if (!ticket || ticket.email !== email) {
    throw AppError.badRequest("Your reset session has expired. Please request a new code.", "RESET_EXPIRED");
  }

  const user = await prisma.user.update({
    where: { id: ticket.userId },
    data: {
      password: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
      resetCode: null,
      resetCodeExpires: null,
      updatedAt: new Date(),
    },
    select: { id: true, email: true, firstName: true, surname: true },
  });

  await discardTicket(TICKET_KIND, resetToken);
  await redis.del(LOGIN_FAIL_PREFIX + email);
  // Whoever knew the old password is signed out everywhere.
  await revokeAllSessions(user.id);

  sendEmailInBackground({ to: user.email, ...passwordChangedEmail({ name: displayName(user), at: new Date() }) });
}
