import prisma from "../../../lib/prisma/prisma";
import { AppError } from "../../../middlewares/centralAppError";
import { LEDGER_CURRENCY } from "../../bookings/ledger";
import { requireMerchantBusiness } from "../merchantBusiness";
import { availableRail, railForCountry } from "./payoutRails";

// The salon's wallet: what it has earned, what it can withdraw, and what's
// still on its way. One wallet per business (created on first use — about a
// third of businesses never had one).

export interface WalletContext {
  businessId: string;
  businessName: string;
  ownerId: string;
  ownerEmail: string | null;
  country: string | null;
  walletId: string;
  currency: string;
}

/** The merchant's business and wallet, creating the wallet if it doesn't exist yet. */
export async function walletContext(userId: string): Promise<WalletContext> {
  const business = await requireMerchantBusiness(userId);
  await prisma.$executeRaw`
    INSERT INTO business_wallets ("businessId", "ownerId", currency, description)
    VALUES (${business.id}::uuid, ${business.ownerId}::uuid, ${LEDGER_CURRENCY}::business_wallets_currency_enum, 'Business wallet - auto-created')
    ON CONFLICT ("businessId") DO NOTHING`;
  const [wallet, details] = await Promise.all([
    prisma.business_wallets.findUniqueOrThrow({ where: { businessId: business.id }, select: { id: true, currency: true } }),
    prisma.businesses.findUniqueOrThrow({ where: { id: business.id }, select: { country: true, ownerEmail: true, user: { select: { email: true } } } }),
  ]);
  return {
    businessId: business.id,
    businessName: business.businessName,
    ownerId: business.ownerId,
    ownerEmail: details.ownerEmail || details.user.email || null,
    country: details.country,
    walletId: wallet.id,
    currency: wallet.currency,
  };
}

const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

/** Midnight of `date` (the merchant's own day) as a UTC instant. */
const dayStart = (date: string, offsetMinutes: number) => new Date(Date.parse(`${date}T00:00:00Z`) + offsetMinutes * 60_000);

/** Balances, this salon's earnings today and this month (on the merchant's own calendar), and payouts under way. */
export async function walletSummary(userId: string, input: { date: string; timezoneOffset?: number }) {
  const ctx = await walletContext(userId);
  const wallet = await prisma.business_wallets.findUniqueOrThrow({ where: { id: ctx.walletId } });
  if (wallet.status === "closed") throw AppError.forbidden("This wallet has been closed. Please contact support.", "WALLET_CLOSED");

  const offset = input.timezoneOffset ?? 0;
  const today = dayStart(input.date, offset);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const [y, m] = input.date.split("-").map(Number);
  const monthStart = dayStart(`${y}-${String(m).padStart(2, "0")}-01`, offset);
  const lastMonthStart = dayStart(m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`, offset);

  const [earnings] = await prisma.$queryRaw<Array<Record<string, number>>>`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE "createdAt" >= ${today} AND "createdAt" < ${tomorrow}), 0)::float AS today,
      COALESCE(SUM(amount) FILTER (WHERE "createdAt" >= ${yesterday} AND "createdAt" < ${today}), 0)::float AS yesterday,
      COUNT(*) FILTER (WHERE "createdAt" >= ${today} AND "createdAt" < ${tomorrow})::int AS "todayCount",
      COALESCE(SUM(amount) FILTER (WHERE "createdAt" >= ${monthStart}), 0)::float AS month,
      COALESCE(SUM(amount) FILTER (WHERE "createdAt" >= ${lastMonthStart} AND "createdAt" < ${monthStart}), 0)::float AS "lastMonth"
    FROM transactions
    WHERE "walletId" = ${ctx.walletId}::uuid AND type = 'Earning' AND status = 'completed'`;
  const open = await prisma.withdrawals.aggregate({
    where: { businessId: ctx.businessId, status: { in: ["Pending", "Processing", "Submitted"] } },
    _sum: { amount: true },
    _count: true,
  });
  const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

  return {
    walletId: ctx.walletId,
    businessName: ctx.businessName,
    country: ctx.country,
    currency: wallet.currency,
    status: wallet.status,
    balance: money(wallet.balance),
    pendingBalance: money(wallet.pendingBalance),
    totalIncome: money(wallet.totalIncome),
    totalExpenses: money(wallet.totalExpenses),
    stats: {
      todayRevenue: money(earnings.today),
      todayChange: change(earnings.today, earnings.yesterday),
      transactionsToday: earnings.todayCount,
      monthlyRevenue: money(earnings.month),
      monthlyChange: change(earnings.month, earnings.lastMonth),
      payoutsInProgress: money(open._sum.amount),
      openPayouts: open._count,
    },
    // Which automatic rail this salon's country routes to, and whether it's switched on.
    payoutRail: railForCountry(ctx.country),
    payoutRailAvailable: !!availableRail(ctx.country),
  };
}
