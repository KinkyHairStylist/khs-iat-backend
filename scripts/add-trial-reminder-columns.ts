// One-off schema script: tracks whether the 5-day and 1-day trial-ending
// reminders have already been sent for a merchant_subscriptions row, so
// the daily cron never sends either one twice. Additive, both nullable —
// existing rows just start out never-reminded. Run BEFORE deploying the
// code that reads/writes them.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/add-trial-reminder-columns.ts
//   apply:    ts-node --project tsconfig.json ./scripts/add-trial-reminder-columns.ts --execute
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
      label: 'merchant_subscriptions.trialReminder5DaySentAt column',
      sql: `ALTER TABLE "merchant_subscriptions" ADD COLUMN IF NOT EXISTS "trialReminder5DaySentAt" timestamptz NULL;`,
    },
    {
      label: 'merchant_subscriptions.trialReminder1DaySentAt column',
      sql: `ALTER TABLE "merchant_subscriptions" ADD COLUMN IF NOT EXISTS "trialReminder1DaySentAt" timestamptz NULL;`,
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
