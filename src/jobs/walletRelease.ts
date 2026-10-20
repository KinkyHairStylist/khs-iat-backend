import prisma from "../lib/prisma/prisma";

// Hourly: booking earnings whose 48-hour hold has passed move from the salon's
// pending balance to its balance (the hold lets a chargeback be recovered from
// money not yet handed out). One statement: an earning's availableAt is cleared
// exactly when its amount moves, so a crash or a second run can't move it twice,
// and the wallet update is relative, so a withdrawal at the same moment isn't
// overwritten. What a chargeback already took from the pending balance isn't
// moved again.

export async function walletRelease(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ walletId: string }>>`
    WITH due AS (
      UPDATE transactions SET "availableAt" = NULL, "updatedAt" = NOW()
      WHERE type = 'Earning' AND "availableAt" IS NOT NULL AND "availableAt" <= NOW() AND "walletId" IS NOT NULL
      RETURNING "walletId", amount
    ), totals AS (
      SELECT "walletId", SUM(amount) AS total FROM due GROUP BY "walletId"
    )
    UPDATE business_wallets w SET
      balance = w.balance + LEAST(t.total, GREATEST(w."pendingBalance", 0)),
      "pendingBalance" = w."pendingBalance" - LEAST(t.total, GREATEST(w."pendingBalance", 0)),
      "updatedAt" = NOW()
    FROM totals t
    WHERE w.id = t."walletId"
    RETURNING w.id::text AS "walletId"`;
  return `${rows.length} wallet(s) released`;
}
