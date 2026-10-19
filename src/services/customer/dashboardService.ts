import prisma from "../../lib/prisma/prisma";
import { CUSTOMER_APP_URL } from "../../config/env";
import { generateUniqueReferralCode } from "../referralService";
import { visibleToCustomerSql } from "../bookings/orderStore";

// The customer dashboard: everything it shows, worked out in one place.

const TREND_MONTHS = 6;
const GIFT_EXPIRY_WARNING_DAYS = 30;

/** The customer's referral link ("…/?ref=CODE"), giving them a code first if they have none. */
export async function referralLink(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  let code = user.referralCode;
  if (!code) {
    code = await generateUniqueReferralCode();
    await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
    code = (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })).referralCode ?? code;
  }
  return `${CUSTOMER_APP_URL}/?ref=${encodeURIComponent(code)}`;
}

/**
 * Referral totals, from what referrers are actually credited: a referral
 * earns its reward when the referred person finishes signing up.
 */
export async function referralStats(userId: string) {
  const rows = await prisma.referral.groupBy({
    by: ["status"],
    where: { referrerId: userId },
    _count: { _all: true },
    _sum: { earning: true },
  });
  const pick = (status: string) => rows.find((r) => r.status === status);
  const completed = pick("completed");
  const pending = pick("pending");
  return {
    totalReferrals: rows.reduce((sum, r) => sum + r._count._all, 0),
    completedReferrals: completed?._count._all ?? 0,
    pendingReferrals: pending?._count._all ?? 0,
    totalEarnings: Number(completed?._sum.earning ?? 0),
    pendingEarnings: Number(pending?._sum.earning ?? 0),
  };
}

async function bookingSummary(userId: string) {
  const [statusRows, upcoming, trend] = await Promise.all([
    prisma.$queryRaw<Array<{ status: string; count: number }>>`
      SELECT a.status::text AS status, COUNT(DISTINCT a."orderId")::int AS count
      FROM appointments a WHERE ${visibleToCustomerSql(userId)} GROUP BY a.status`,
    // One row per order still on the calendar, soonest first (dates are stored as "YYYY-MM-DD").
    prisma.$queryRaw<Array<{ orderId: string; serviceName: string; salonName: string | null; address: string | null; date: string; time: string }>>`
      SELECT DISTINCT ON (a."orderId") a."orderId", a."serviceName", b."businessName" AS "salonName", b."businessAddress" AS address, a.date, a.time
      FROM appointments a LEFT JOIN businesses b ON b.id = a.business_id
      WHERE ${visibleToCustomerSql(userId)} AND a.status IN ('Pending', 'Confirmed', 'Rescheduled')
        AND a.date >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
      ORDER BY a."orderId", a."createdAt"`,
    prisma.$queryRaw<Array<{ month: string; amount: number }>>`
      SELECT TO_CHAR(DATE_TRUNC('month', a."createdAt"), 'YYYY-MM') AS month, SUM(a.amount)::float AS amount
      FROM appointments a
      WHERE ${visibleToCustomerSql(userId)} AND a."paymentStatus" = 'Paid'
        AND a."createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
      GROUP BY 1`,
  ]);

  const sortedUpcoming = upcoming.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const now = new Date();
  const months = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (TREND_MONTHS - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month: key, amount: trend.find((t) => t.month === key)?.amount ?? 0 };
  });

  return {
    upcomingCount: sortedUpcoming.length,
    upcoming: sortedUpcoming.slice(0, 3),
    byStatus: statusRows.map((r) => ({ status: r.status === "No_Show" ? "No Show" : r.status, count: r.count })),
    monthlySpend: months,
  };
}

async function spending(userId: string) {
  const totals = await prisma.transactions.aggregate({
    where: { senderId: userId, type: "Debit", status: "completed" },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { totalSpent: Number(totals._sum.amount ?? 0), paymentsCount: totals._count._all };
}

async function membership(userId: string) {
  const sub = await prisma.membership_subscription.findFirst({
    where: { userId, status: "active", endDate: { gte: new Date(new Date().toDateString()) } },
    select: { endDate: true, nextBillingDate: true, membership_tier: { select: { name: true } } },
    orderBy: { endDate: "desc" },
  });
  return sub ? { active: true, tierName: sub.membership_tier.name, renewsAt: sub.nextBillingDate ?? sub.endDate } : { active: false, tierName: null, renewsAt: null };
}

async function giftCards(userId: string) {
  const cards = await prisma.business_gift_cards.findMany({
    where: { ownerId: userId, soldStatus: "purchased", status: "Active", remainingAmount: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { id: true, title: true, remainingAmount: true, expiresAt: true },
  });
  const soon = cards
    .filter((c) => c.expiresAt)
    .map((c) => ({ id: c.id, title: c.title, balance: Number(c.remainingAmount), expiresAt: c.expiresAt, days: Math.ceil((c.expiresAt!.getTime() - Date.now()) / 86_400_000) }))
    .filter((c) => c.days <= GIFT_EXPIRY_WARNING_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, 2);
  return { activeCount: cards.length, expiringSoon: soon };
}

export async function getDashboard(userId: string) {
  const [spend, bookings, referrals, link, sub, gifts] = await Promise.all([
    spending(userId), bookingSummary(userId), referralStats(userId), referralLink(userId), membership(userId), giftCards(userId),
  ]);
  return { spending: spend, bookings, referrals: { ...referrals, link }, membership: sub, giftCards: gifts };
}
