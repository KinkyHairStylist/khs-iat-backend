// One-off schema script: lets a merchant declare a country and a payout
// currency per saved payment method, and snapshots the ledger currency,
// payout currency, exchange rate and converted amount onto each withdrawal
// at request time (so a later FX-rate change can't retroactively alter a
// past request). Plain varchar for the new currency columns, not a Postgres
// enum type, to avoid touching the existing wallets_currency_enum type.
// Additive and safe to re-run. Run BEFORE deploying the code that reads
// these columns.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/add-payout-currency-columns.ts
//   apply:    ts-node --project tsconfig.json ./scripts/add-payout-currency-columns.ts --execute
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const isExecute = process.argv.includes('--execute');

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
  console.log(`Connected to ${process.env.DB_DATABASE}. Mode: ${isExecute ? 'EXECUTE' : 'DRY RUN (pass --execute to apply)'}\n`);

  const statements: { label: string; sql: string }[] = [
    { label: 'businesses.country', sql: `ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "country" varchar(2);` },
    { label: 'wallet_payment_methods.payoutCurrency', sql: `ALTER TABLE "wallet_payment_methods" ADD COLUMN IF NOT EXISTS "payoutCurrency" varchar(3);` },
    { label: 'wallet_payment_methods.country', sql: `ALTER TABLE "wallet_payment_methods" ADD COLUMN IF NOT EXISTS "country" varchar(2);` },
    { label: 'withdrawals.currency', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "currency" varchar(3) NOT NULL DEFAULT 'USD';` },
    { label: 'withdrawals.payoutCurrency', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "payoutCurrency" varchar(3);` },
    { label: 'withdrawals.exchangeRate', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "exchangeRate" numeric(18,8);` },
    { label: 'withdrawals.payoutAmount', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "payoutAmount" numeric(14,2);` },
  ];

  for (const { label, sql } of statements) {
    console.log(`--- ${label} ---`);
    console.log(sql.trim());
    if (isExecute) {
      await ds.query(sql);
      console.log('APPLIED\n');
    } else {
      console.log('(dry run, not applied)\n');
    }
  }
  await ds.destroy();
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
