// One-off schema script: records who deactivated a gift card, whether that was KHS or the salon, and when,
// so the card can say so and only the right side can reactivate it.
// Additive and safe to re-run. Run BEFORE deploying the code that reads these columns.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/add-gift-card-deactivation-columns.ts
//   apply:    ts-node --project tsconfig.json ./scripts/add-gift-card-deactivation-columns.ts --execute
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
    { label: 'business_gift_cards.deactivatedBy', sql: `ALTER TABLE "business_gift_cards" ADD COLUMN IF NOT EXISTS "deactivatedBy" varchar(255);` },
    { label: 'business_gift_cards.deactivatedByRole', sql: `ALTER TABLE "business_gift_cards" ADD COLUMN IF NOT EXISTS "deactivatedByRole" varchar(20);` },
    { label: 'business_gift_cards.deactivatedAt', sql: `ALTER TABLE "business_gift_cards" ADD COLUMN IF NOT EXISTS "deactivatedAt" timestamptz;` },
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
