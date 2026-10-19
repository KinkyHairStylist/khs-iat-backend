import bcrypt from "bcryptjs";
import { Prisma } from "../../generated/prisma/client";
import prisma, { MONEY_TX_OPTIONS } from "../../lib/prisma/prisma";
import { DELIVERY_TEAM_EMAIL } from "../../config/env";
import { sendEmailInBackground } from "../../lib/emailEngine/sendgrid";
import { deleteAvatarFiles } from "../../lib/firebase/storage";
import { revokeAllSessions, revokeOtherSessions } from "../../lib/redis/sessionStore";
import { accountDeletedEmail, passwordChangedEmail } from "../../emails";
import { AppError } from "../../middlewares/centralAppError";
import { getServiceLogger } from "../../utils/loggerCreator";
import { BCRYPT_ROUNDS, displayName } from "../auth/accountAccess";
import { holdCutoff } from "../bookings/bookingHolds";
import { deleteAllCards } from "./cardsService";

const logger = getServiceLogger("account");

// Changing the password and closing the account (Settings → Privacy & Security).

/** Checks the current password, sets the new one and signs out every other device. */
export async function changePassword(userId: string, sid: string, input: { currentPassword: string; newPassword: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, surname: true, password: true } });
  if (!user) throw AppError.notFound("Account");
  if (!user.password || !(await bcrypt.compare(input.currentPassword, user.password))) {
    throw AppError.badRequest("Your current password is incorrect.", "WRONG_PASSWORD");
  }
  await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS), updatedAt: new Date() } });
  await revokeOtherSessions(userId, sid);
  sendEmailInBackground({ to: user.email, ...passwordChangedEmail({ name: displayName(user), at: new Date() }) });
}

/**
 * Closes the account. The person's details and their own data (addresses,
 * cards, favourites, settings, notifications, photo) are removed; bookings,
 * payments and memberships stay, anonymised, because salons and the ledger
 * rely on them. Accounts that run or work for a salon go through support.
 */
export async function closeAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, surname: true, isMerchant: true, isStaff: true, isBusinessStaff: true, isAdmin: true, isSuperAdmin: true },
  });
  if (!user) throw AppError.notFound("Account");

  const ownsSalon = (await prisma.businesses.count({ where: { owner_id: userId } })) > 0;
  if (ownsSalon || user.isMerchant || user.isStaff || user.isBusinessStaff || user.isAdmin || user.isSuperAdmin) {
    throw AppError.conflict("This account is also used for a salon or by the KHS team, so it can't be closed here. Please contact support.", "ACCOUNT_IN_USE");
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await prisma.appointments.count({
    where: {
      client_id: userId,
      date: { gte: today },
      OR: [{ status: { in: ["Confirmed", "Rescheduled"] } }, { status: "Pending", createdAt: { gte: holdCutoff() } }],
    },
  });
  if (upcoming > 0) {
    throw AppError.conflict("You have upcoming bookings. Please cancel them before closing your account.", "HAS_UPCOMING_BOOKINGS");
  }

  await prisma.$transaction(async (tx) => {
    await deleteAllCards(tx, userId);
    await tx.user_address.deleteMany({ where: { userId } });
    await tx.favoriteService.deleteMany({ where: { userId } });
    await tx.user_preferences.deleteMany({ where: { userId } });
    await tx.user_notification_settings.deleteMany({ where: { userId } });
    await tx.notifications.deleteMany({ where: { userId } });
    await tx.refresh_tokens.deleteMany({ where: { user_id: userId } });
    // The email is freed (the person can sign up again) and nothing can sign in to this row.
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`, password: null, firstName: "Deleted", surname: "Customer", phoneNumber: null,
        dateOfBirth: null, avatarUrl: null, addresses: Prisma.DbNull, referralCode: null, city: null, state: null, country: null,
        verificationCode: null, resetCode: null, isVerified: false, isCustomer: false, isClient: false, updatedAt: new Date(),
      },
    });
  }, MONEY_TX_OPTIONS);

  await revokeAllSessions(userId);
  await deleteAvatarFiles(userId);
  sendEmailInBackground({ to: user.email, ...accountDeletedEmail({ name: user.firstName || "there" }), cc: DELIVERY_TEAM_EMAIL || undefined });
  logger.info("Customer account closed", { userId });
}
