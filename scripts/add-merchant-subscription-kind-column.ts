// One-off schema script: records how each merchant started (free trial, the free
// window with a shared end date, or a paid plan) on merchant_subscriptions.kind.
// Additive. Existing rows are 'trial', except those that already have a Stripe
// subscription, which are 'paid'. Run BEFORE deploying the code that reads it.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/add-merchant-subscription-kind-column.ts
//   apply:    ts-node --project tsconfig.json ./scripts/add-merchant-subscription-kind-column.ts --execute
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
    {
      label: 'merchant_subscriptions.kind column',
      sql: `ALTER TABLE "merchant_subscriptions" ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'trial';`,
    },
    {
      label: 'existing Stripe-billed rows are paid',
      sql: `UPDATE "merchant_subscriptions" SET "kind" = 'paid' WHERE "stripeSubscriptionId" IS NOT NULL AND "kind" = 'trial';`,
    },
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
  console.error('Schema script failed:', err);
  process.exit(1);
});
