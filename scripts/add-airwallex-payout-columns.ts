// One-off schema script: adds what the Airwallex payout rail needs to a
// saved payment method (its Beneficiary id, the raw bank-detail fields it
// was created with, and which transfer method it uses), a new 'Submitted'
// value on withdrawals.status (plain varchar, so this is a no-op migration
// for it — listed here only for documentation), and a new PaymentMethodType
// enum value for an Airwallex Beneficiary. Additive and safe to re-run. Run
// BEFORE deploying the code that reads these columns/enum value.
//
// Mirrors add-automatic-payout-columns.ts's exact shape — same dry-run/
// --execute gate, same dynamic enum-type-name lookup (never guessed), same
// "the enum ADD VALUE runs as its own unbatched statement" rule (Postgres
// requirement, already respected here).
//
//   dry run:  ts-node --project tsconfig.json ./scripts/add-airwallex-payout-columns.ts
//   apply:    ts-node --project tsconfig.json ./scripts/add-airwallex-payout-columns.ts --execute
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
      label: 'PaymentMethodType enum: add airwallex_connect',
      sql: `ALTER TYPE "${enumTypeName}" ADD VALUE IF NOT EXISTS 'airwallex_connect';`,
    },
    { label: 'wallet_payment_methods.airwallexBeneficiaryId', sql: `ALTER TABLE "wallet_payment_methods" ADD COLUMN IF NOT EXISTS "airwallexBeneficiaryId" varchar(64);` },
    { label: 'wallet_payment_methods.airwallexBeneficiaryDetails', sql: `ALTER TABLE "wallet_payment_methods" ADD COLUMN IF NOT EXISTS "airwallexBeneficiaryDetails" jsonb;` },
    { label: 'wallet_payment_methods.airwallexTransferMethod', sql: `ALTER TABLE "wallet_payment_methods" ADD COLUMN IF NOT EXISTS "airwallexTransferMethod" varchar(10);` },
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

  console.log('--- withdrawals.status ---');
  console.log("No column change needed — it's a plain varchar (not a DB enum);");
  console.log("the new 'Submitted' value is a TS-level addition only.\n");

  await ds.destroy();
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
