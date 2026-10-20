import prisma from "../../../lib/prisma/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import type { WalletTransactionQuery } from "../../../schemas/merchant/wallet.schema";
import { walletContext } from "./walletAccount";

// The wallet's ledger: money in (earnings, refunds) and out (withdrawals,
// debits). KHS's fees aren't rows here; each earning shows what was taken
// out of it instead.

const money = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

export async function listTransactions(userId: string, q: WalletTransactionQuery) {
  const ctx = await walletContext(userId);
  const where: Prisma.transactionsWhereInput = { walletId: ctx.walletId, type: q.type === "All" ? { not: "Fee" } : q.type };
  const [rows, total] = await Promise.all([
    prisma.transactions.findMany({
      where,
      orderBy: { createdAt: q.sortOrder },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true, amount: true, type: true, status: true, description: true, service: true, customerName: true, referenceId: true,
        method: true, currency: true, createdAt: true, availableAt: true,
        user_transactions_senderIdTouser: { select: { firstName: true, surname: true, email: true } },
      },
    }),
    prisma.transactions.count({ where }),
  ]);

  // The fees taken from each earning share its reference (the booking's payment).
  const refs = [...new Set(rows.filter((r) => r.type === "Earning" && r.referenceId).map((r) => r.referenceId as string))];
  const fees = refs.length
    ? await prisma.transactions.groupBy({
        by: ["referenceId", "feeSubtype"],
        where: { type: "Fee", referenceId: { in: refs }, senderId: ctx.ownerId, feeSubtype: { in: ["Commission", "Acquisition"] } },
        _sum: { amount: true },
      })
    : [];
  const feeOf = (ref: string | null, subtype: string) => money(fees.find((f) => f.referenceId === ref && f.feeSubtype === subtype)?._sum.amount);

  return {
    transactions: rows.map((r) => {
      const sender = r.user_transactions_senderIdTouser;
      const commission = r.type === "Earning" ? feeOf(r.referenceId, "Commission") : 0;
      const acquisition = r.type === "Earning" ? feeOf(r.referenceId, "Acquisition") : 0;
      return {
        id: r.id,
        type: r.type,
        status: r.status,
        amount: money(r.amount),
        currency: r.currency ?? ctx.currency,
        description: r.description,
        service: r.service,
        method: r.method,
        reference: r.referenceId,
        createdAt: r.createdAt.toISOString(),
        // Still on hold (a card payment's chargeback window) until this time.
        availableAt: r.availableAt?.toISOString() ?? null,
        counterparty: sender ? { name: `${sender.firstName ?? ""} ${sender.surname ?? ""}`.trim() || r.customerName || null, email: sender.email } : r.customerName ? { name: r.customerName, email: null } : null,
        feeBreakdown: commission || acquisition ? { grossAmount: money(Number(r.amount) + commission + acquisition), commissionAmount: commission, acquisitionFeeAmount: acquisition } : null,
      };
    }),
    total,
    page: q.page,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
    startIndex: total ? (q.page - 1) * q.limit + 1 : 0,
    endIndex: Math.min(q.page * q.limit, total),
  };
}
