// One-off schema script: lets a merchant turn the client-side 50% deposit
// option on/off (business_owner_settings.pricingPolicies.allowDepositPayment).
// Additive and nullable-safe; existing rows (and salons with no settings row)
// keep today's behaviour, where the deposit option is offered. Raw SQL,
// matching add-deposit-booking-schema.ts. The column name follows TypeORM's
// embedded naming ("pricingPolicies" + title-cased property).
//
//   dry run:  ts-node --project tsconfig.json ./scripts/add-allow-deposit-payment-column.ts
//   apply:    ts-node --project tsconfig.json ./scripts/add-allow-deposit-payment-column.ts --execute
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
      label: 'business_owner_settings.pricingPoliciesAllowdepositpayment column',
      sql: `ALTER TABLE "business_owner_settings" ADD COLUMN IF NOT EXISTS "pricingPoliciesAllowdepositpayment" boolean DEFAULT true;`,
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
