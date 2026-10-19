import crypto from "crypto";
import prisma from "../lib/prisma/prisma";
import { sendEmailInBackground } from "../lib/emailEngine/sendgrid";
import { referralRewardEmail } from "../emails";
import { getServiceLogger } from "../utils/loggerCreator";
import { formatMoney } from "../utils/money";
import { REFERRAL_REWARD_AMOUNT } from "../config/env";

const logger = getServiceLogger("referral-service");

/** 16 upper-case hex characters, the format every existing code uses. */
function newReferralCode(): string {
  return crypto.randomBytes(8).toString("hex").toUpperCase();
}

/** A referral code no account has yet. */
export async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = newReferralCode();
    const taken = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("Could not generate a unique referral code");
}

function findReferrer(code: string) {
  return prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true, email: true, firstName: true, surname: true },
  });
}

/**
 * Someone arrived through a referral link and started signing up. Records a
 * pending referral (once per email) so it can be completed when they finish.
 * Never throws — a bad code must not stop anyone signing up.
 */
export async function recordReferralIntent(referralCode: string, referredEmail: string): Promise<void> {
  try {
    const referrer = await findReferrer(referralCode);
    if (!referrer || referrer.email.toLowerCase() === referredEmail) return;

    const existing = await prisma.referral.findFirst({
      where: { referredEmail: { equals: referredEmail, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return;

    await prisma.referral.create({
      data: { referrerId: referrer.id, referredEmail, referralCode, status: "pending", earning: REFERRAL_REWARD_AMOUNT },
    });
  } catch (err) {
    logger.warn("Could not record referral", { referralCode, error: (err as Error).message });
  }
}

/**
 * A referred customer finished signing up: completes their pending referral
 * and pays the referrer, exactly once. `typedCode` (entered on the sign-up
 * form) is used when they didn't arrive through a link. Never throws.
 */
export async function completeReferral(customer: { id: string; email: string }, typedCode?: string): Promise<void> {
  try {
    if (typedCode) await recordReferralIntent(typedCode, customer.email);

    const referral = await prisma.referral.findFirst({
      where: { referredEmail: { equals: customer.email, mode: "insensitive" }, status: "pending" },
    });
    if (!referral || referral.referrerId === customer.id) return;

    // The status check inside the update makes this safe to run twice: only
    // one run moves it from pending, and only that run pays the referrer.
    const paid = await prisma.$transaction(async (tx) => {
      const { count } = await tx.referral.updateMany({
        where: { id: referral.id, status: "pending" },
        data: { status: "completed", referredUserId: customer.id, isPaid: false },
      });
      if (count === 0) return false;
      await tx.user.update({
        where: { id: referral.referrerId },
        data: {
          totalEarnings: { increment: referral.earning },
          availableEarnings: { increment: referral.earning },
          updatedAt: new Date(),
        },
      });
      return true;
    });
    if (!paid) return;

    const referrer = await prisma.user.findUnique({
      where: { id: referral.referrerId },
      select: { email: true, firstName: true, surname: true },
    });
    if (referrer) {
      const name = [referrer.firstName, referrer.surname].filter(Boolean).join(" ") || "there";
      // The amount recorded on the referral when it was made, in the platform currency.
      const mail = referralRewardEmail({ name, referredEmail: customer.email, reward: formatMoney(referral.earning) });
      sendEmailInBackground({ to: referrer.email, ...mail });
    }
  } catch (err) {
    logger.error("Could not complete referral", { customerId: customer.id, error: (err as Error).message });
  }
}
