// One-off schema script: what a payout needs beyond a request. The transfer reference and date once
// KHS has sent the money, the reason when a request is rejected, when it was reviewed, and the ledger
// row the request took the money out of (so approving, paying or rejecting can update that row).
// Additive and safe to re-run. Run BEFORE deploying the code that reads these columns.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/add-withdrawal-payout-columns.ts
//   apply:    ts-node --project tsconfig.json ./scripts/add-withdrawal-payout-columns.ts --execute
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
    { label: 'withdrawals.payoutReference', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "payoutReference" varchar(120);` },
    { label: 'withdrawals.paidAt', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "paidAt" timestamptz;` },
    { label: 'withdrawals.rejectionReason', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "rejectionReason" text;` },
    { label: 'withdrawals.reviewedAt', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "reviewedAt" timestamptz;` },
    { label: 'withdrawals.transactionId', sql: `ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "transactionId" uuid;` },
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
