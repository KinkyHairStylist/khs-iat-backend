// One-off schema script: adds what Stripe Connect needs to a saved payment
// method (its connected account id and whether Stripe's own review has
// enabled payouts on it), a permanent snapshot of how each withdrawal
// actually went out, and a new PaymentMethodType enum value for a Stripe
// Connect payment method. Additive and safe to re-run. Run BEFORE deploying
// the code that reads these columns/enum value.
//
// The enum-value ADD is NOT part of the plain-varchar-column pattern the
// rest of this script follows — Postgres requires ALTER TYPE ... ADD VALUE
// to run as its own statement, never batched with other DDL, which this
// script already respects (each entry runs as its own `ds.query()` call).
// The exact enum type name is looked up first rather than guessed.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/add-automatic-payout-columns.ts
//   apply:    ts-node --project tsconfig.json ./scripts/add-automatic-payout-columns.ts --execute
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

  // Find the real Postgres enum type backing wallet_payment_methods.type —
  // never guess this name.
  const enumTypeRows: { typname: string }[] = await ds.query(
    `SELECT t.typname FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE e.enumlabel = 'bank_account';`,
  );
  const enumTypeName = enumTypeRows[0]?.typname;
  console.log(`--- resolved enum type for PaymentMethodType ---`);
  console.log(enumTypeName ? `Found: "${enumTypeName}"` : 'NOT FOUND — check manually before proceeding, aborting.');
  console.log();
  if (!enumTypeName) {
    await ds.destroy();
    process.exit(1);
  }

  const statements: { label: string; sql: string }[] = [
    {
      label: 'PaymentMethodType enum: add stripe_connect',
      sql: `ALTER TYPE "${enumTypeName}" ADD VALUE IF NOT EXISTS 'stripe_connect';`,
    },
    { label: 'wallet_payment_methods.stripeAccountId', sql: `ALTER TABLE "wallet_payment_methods" ADD COLUMN IF NOT EXISTS "stripeAccountId" varchar(64);` },
    { label: 'wallet_payment_methods.stripePayoutsEnabled', sql: `ALTER TABLE "wallet_payment_methods" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" boolean NOT NULL DEFAULT false;` },
    { label: 'withdrawals.payoutMethod', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "payoutMethod" varchar(10) NOT NULL DEFAULT 'manual';` },
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
