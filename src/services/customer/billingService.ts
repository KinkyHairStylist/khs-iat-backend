import { Prisma } from "../../generated/prisma/client";
import prisma from "../../lib/prisma/prisma";
import { AppError } from "../../middlewares/centralAppError";

// Billing history: what the customer paid (and was paid), from the ledger.
// Shown: their payments (bookings, gift cards, memberships), the fees they paid
// on top (card processing, gift card fee) and money paid to them (referral
// rewards). Left out: fees that come out of the salon's share, attempts that
// never charged anything, and started payments abandoned over a day ago.

/** Refunds can be asked for within this many days of paying (as before). */
export const REFUND_WINDOW_DAYS = 30;
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

const customerRows = (userId: string): Prisma.transactionsWhereInput => {
  const settled: Prisma.transactionsWhereInput = {
    OR: [{ status: "completed" }, { status: "pending", createdAt: { gte: new Date(Date.now() - ABANDONED_AFTER_MS) } }],
  };
  return {
    OR: [
      { senderId: userId, type: "Debit", ...settled },
      { senderId: userId, type: "Fee", AND: [settled, { OR: [{ feeSubtype: "StripePassthrough" }, { service: "GiftCard-Fee" }] }] },
      { recipientId: userId, type: "Earning", status: "completed" },
    ],
  };
};

const ROW_SELECT = {
  id: true, type: true, service: true, description: true, amount: true, currency: true, status: true, referenceId: true, createdAt: true,
  senderId: true, refunds: { select: { amount: true, status: true } },
} as const;

type Row = Prisma.transactionsGetPayload<{ select: typeof ROW_SELECT }>;
export type TransactionKind = "salon" | "membership" | "gift-card" | "fee" | "credit";

function kindOf(row: Row): TransactionKind {
  if (row.type === "Earning") return "credit";
  if (row.type === "Fee") return "fee";
  if (row.service?.startsWith("GiftCard")) return "gift-card";
  if (row.service?.startsWith("Membership")) return "membership";
  return "salon";
}

export function refundableUntil(createdAt: Date): Date {
  return new Date(createdAt.getTime() + REFUND_WINDOW_DAYS * 86_400_000);
}

function toView(row: Row, now = Date.now()) {
  const refunded = row.refunds ? Number(row.refunds.amount) : 0;
  const amount = Number(row.amount);
  // A request on its own is a pending row with nothing refunded yet.
  const refundRequested = !!row.refunds && refunded === 0 && row.refunds.status === "pending";
  const status = row.status !== "completed" ? "pending" : refunded >= amount ? "refunded" : refunded > 0 ? "partially_refunded" : "paid";
  return {
    id: row.id,
    kind: kindOf(row),
    description: row.description,
    reference: row.referenceId,
    amount,
    currency: row.currency ?? "AUD",
    status,
    refundedAmount: refunded,
    refundRequested,
    canRequestRefund: row.type === "Debit" && status === "paid" && !row.refunds && refundableUntil(row.createdAt).getTime() > now,
    createdAt: row.createdAt.toISOString(),
  };
}

export type BillingTransaction = ReturnType<typeof toView>;

/** Newest first, a page at a time (keyset on createdAt + id, so new rows never shift a page). */
export async function listTransactions(userId: string, { cursor, limit }: { cursor?: string; limit: number }) {
  let after: Prisma.transactionsWhereInput = {};
  if (cursor) {
    const last = await prisma.transactions.findFirst({ where: { AND: [{ id: cursor }, customerRows(userId)] }, select: { createdAt: true } });
    if (!last) throw AppError.badRequest("That page has expired. Please reload your billing history.", "INVALID_CURSOR");
    after = { OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: cursor } }] };
  }
  const rows = await prisma.transactions.findMany({
    where: { AND: [customerRows(userId), after] },
    select: ROW_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return { transactions: page.map((r) => toView(r)), nextCursor: rows.length > limit ? page[page.length - 1].id : null };
}

/** One of the customer's own rows (for a refund request). */
export async function findCustomerTransaction(userId: string, id: string) {
  const row = await prisma.transactions.findFirst({ where: { AND: [{ id }, customerRows(userId)] }, select: ROW_SELECT });
  if (!row) throw AppError.notFound("Transaction");
  return { row, view: toView(row) };
}

/** A year's totals over the customer's whole history (not just the loaded page). */
export async function getSummary(userId: string, year = new Date().getFullYear()) {
  const range = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
  const [payments, fees, refunds] = await Promise.all([
    prisma.transactions.aggregate({ where: { senderId: userId, type: "Debit", status: "completed", createdAt: range }, _sum: { amount: true }, _count: true }),
    prisma.transactions.aggregate({
      where: { senderId: userId, type: "Fee", status: "completed", createdAt: range, OR: [{ feeSubtype: "StripePassthrough" }, { service: "GiftCard-Fee" }] },
      _sum: { amount: true },
    }),
    prisma.refunds.aggregate({ where: { userId, amount: { gt: 0 }, createdAt: range }, _sum: { amount: true } }),
  ]);
  const toNumber = (d: Prisma.Decimal | null) => (d ? Number(d) : 0);
  return {
    year,
    totalSpent: Math.round((toNumber(payments._sum.amount) + toNumber(fees._sum.amount)) * 100) / 100,
    successfulPayments: payments._count,
    totalRefunded: toNumber(refunds._sum.amount),
  };
}
