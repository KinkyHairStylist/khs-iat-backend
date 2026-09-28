// Read-only audit for SPR-19-04-056. Finds every historical Paystack
// booking whose acquisition/commission fee was recorded as a COMPLETED
// Transaction but never actually debited from the merchant's wallet
// balance (the bug fixed in booking.service.ts's completeBooking), and
// every Paystack booking that also used a gift card (the double-credit
// case). Never writes anything.
//
//   ts-node --project tsconfig.json ./scripts/audit-paystack-commission-gap.ts
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  await ds.initialize();
  console.log(`Connected to ${process.env.DB_DATABASE}. Read-only — no writes.\n`);

  // Every Paystack booking-payment credit (the merchant-facing "got paid" event).
  const credits: { referenceId: string; amount: string; createdAt: Date; walletId: string }[] =
    await ds.query(`
      SELECT "referenceId", amount, "createdAt", "walletId"
      FROM transactions
      WHERE type = 'Earning' AND method = 'Paystack'
        AND description LIKE 'Booking payment for order%'
      ORDER BY "createdAt" ASC
    `);

  console.log(`--- Paystack booking-payment credits ---`);
  console.log(`${credits.length} booking(s) were credited via the Paystack completeBooking path.\n`);

  if (credits.length === 0) {
    console.log('Nothing to audit — no Paystack booking credits found in this database.');
    await ds.destroy();
    return;
  }

  const refs = credits.map((c) => c.referenceId);

  // The fee rows that were marked COMPLETED but never actually debited.
  const fees: { referenceId: string; feeSubtype: string; amount: string }[] = await ds.query(
    `SELECT "referenceId", "feeSubtype", amount
     FROM transactions
     WHERE type = 'Fee' AND method = 'Paystack' AND status = 'completed'
       AND "referenceId" = ANY($1)`,
    [refs],
  );

  // Gift-card portions on the same reference (the double-credit case).
  const giftCardPortions: { referenceId: string; amount: string }[] = await ds.query(
    `SELECT "referenceId", amount
     FROM transactions
     WHERE method = 'GiftCard' AND "referenceId" = ANY($1)`,
    [refs],
  );

  const feesByRef = new Map<string, number>();
  for (const f of fees) {
    feesByRef.set(f.referenceId, (feesByRef.get(f.referenceId) ?? 0) + Number(f.amount));
  }
  const giftCardByRef = new Map<string, number>();
  for (const g of giftCardPortions) {
    giftCardByRef.set(g.referenceId, (giftCardByRef.get(g.referenceId) ?? 0) + Number(g.amount));
  }

  let totalCredited = 0;
  let totalFeeNeverCollected = 0;
  let totalGiftCardDoubleCredited = 0;
  let bookingsWithUncollectedFee = 0;
  let bookingsWithGiftCardDoubleCredit = 0;
  let earliest: Date | null = null;
  let latest: Date | null = null;

  const businessIds = new Set<string>();
  const walletById: Record<string, string> = {};

  for (const c of credits) {
    const amount = Number(c.amount);
    totalCredited += amount;
    const fee = feesByRef.get(c.referenceId) ?? 0;
    const giftCard = giftCardByRef.get(c.referenceId) ?? 0;
    if (fee > 0) {
      totalFeeNeverCollected += fee;
      bookingsWithUncollectedFee += 1;
    }
    if (giftCard > 0) {
      totalGiftCardDoubleCredited += giftCard;
      bookingsWithGiftCardDoubleCredit += 1;
    }
    if (!earliest || c.createdAt < earliest) earliest = c.createdAt;
    if (!latest || c.createdAt > latest) latest = c.createdAt;
    walletById[c.walletId] = walletById[c.walletId] ?? c.referenceId;
  }

  const walletIds = [...new Set(credits.map((c) => c.walletId))];
  const wallets: { id: string; businessId: string }[] = await ds.query(
    `SELECT id, "businessId" FROM business_wallets WHERE id = ANY($1)`,
    [walletIds],
  );
  const businessIdByWallet = new Map(wallets.map((w) => [w.id, w.businessId]));
  const affectedBusinessIds = new Set(credits.map((c) => businessIdByWallet.get(c.walletId)).filter(Boolean));

  console.log(`Date range: ${earliest?.toISOString()} to ${latest?.toISOString()}`);
  console.log(`Total credited to merchants via this path: $${totalCredited.toFixed(2)}`);
  console.log(`Distinct businesses affected: ${affectedBusinessIds.size}\n`);

  console.log(`--- Fee never actually debited (recorded COMPLETED, balance never touched) ---`);
  console.log(`${bookingsWithUncollectedFee} of ${credits.length} booking(s) had a fee that was never collected.`);
  console.log(`Total commission + acquisition fee never collected: $${totalFeeNeverCollected.toFixed(2)}\n`);

  console.log(`--- Gift-card portion double-credited (paid at gift-card sale, then again here) ---`);
  console.log(`${bookingsWithGiftCardDoubleCredit} of ${credits.length} booking(s) mixed a gift card with Paystack.`);
  console.log(`Total gift-card amount double-credited: $${totalGiftCardDoubleCredited.toFixed(2)}\n`);

  const totalOverpaid = totalFeeNeverCollected + totalGiftCardDoubleCredited;
  console.log(`=== Total merchants were overpaid, across all Paystack bookings found: $${totalOverpaid.toFixed(2)} ===`);

  await ds.destroy();
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
