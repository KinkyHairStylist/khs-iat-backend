// One-off data fix. Suspending an account used to mark it as unverified, and reactivating it marked it
// verified, so suspension and verification were tangled. Suspension is now its own flag and leaves
// verification alone. Accounts suspended under the old behaviour were left unverified, so without this
// they could not sign in after being reactivated.
//
// An account only gets a password after its email is verified, so a suspended account that is
// unverified but has a password was verified before it was suspended. Those get their verification back.
// One that never set a password is left as it is: it never finished verifying.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/restore-verified-on-suspended-users.ts
//   apply:    ts-node --project tsconfig.json ./scripts/restore-verified-on-suspended-users.ts --execute
// Run it once per environment, before or with the deploy of the code that stops suspend/unsuspend
// changing verification.
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

  const affected: { id: string }[] = await ds.query(
    `SELECT id FROM "user" WHERE "isSuspended" = true AND "isVerified" = false AND password IS NOT NULL`,
  );
  console.log(`${affected.length} suspended account(s) were verified before they were suspended:`);
  for (const row of affected) console.log(`  ${row.id}`);

  if (isExecute && affected.length > 0) {
    const result = await ds.query(
      `UPDATE "user" SET "isVerified" = true
        WHERE "isSuspended" = true AND "isVerified" = false AND password IS NOT NULL`,
    );
    console.log(`\nAPPLIED (${Array.isArray(result) ? result[1] : affected.length} row(s))`);
  } else if (!isExecute) {
    console.log('\n(dry run, nothing changed)');
  }
  await ds.destroy();
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
