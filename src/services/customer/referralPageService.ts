import prisma from "../../lib/prisma/prisma";
import { REFERRAL_REWARD_AMOUNT } from "../../config/env";
import { referralLink, referralStats } from "./dashboardService";

// The referral page: totals, the customer's code and link, and who they referred.

/** "j***@example.com" — enough to recognise, without showing someone's whole address. */
function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [name, domain] = email.split("@");
  return domain ? `${name.charAt(0)}***@${domain}` : "—";
}

export async function getReferralPage(userId: string) {
  const [stats, link, referrals] = await Promise.all([
    referralStats(userId),
    referralLink(userId),
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, referredEmail: true, referredUserId: true, status: true, earning: true, createdAt: true },
    }),
  ]);
  const ids = referrals.map((r) => r.referredUserId).filter((id): id is string => !!id);
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, surname: true } }) : [];

  return {
    ...stats,
    // What a referral earns now (each referral keeps the amount it was made with).
    rewardAmount: REFERRAL_REWARD_AMOUNT,
    code: new URL(link).searchParams.get("ref") ?? "",
    link,
    referrals: referrals.map((r) => {
      const person = people.find((p) => p.id === r.referredUserId);
      // First name and initial for someone who joined; a masked email while they haven't.
      const name = person ? `${person.firstName ?? ""} ${person.surname ? `${person.surname.charAt(0)}.` : ""}`.trim() : "";
      return { id: r.id, name: name || maskEmail(r.referredEmail), date: r.createdAt, amount: Number(r.earning), status: r.status === "completed" ? "completed" : "pending" };
    }),
  };
}
