// One-off cleanup: removes the test staff (and their linked user accounts,
// where one was created) added while reproducing the Add Staff 500 error
// against the real IAT database during manual testing. Safety-gated —
// only ever touches rows whose email is in the exact list below.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/cleanup-500-repro-test-staff.ts
//   apply:    ts-node --project tsconfig.json ./scripts/cleanup-500-repro-test-staff.ts --execute
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const isExecute = process.argv.includes('--execute');

const TEST_EMAILS = [
  'test-stylist-500-repro@example.com',
  'test-stylist-500-repro-2@example.com',
  'test-stylist-500-repro-3@example.com',
  'test-stylist-500-repro-4@example.com',
  'test-stylist-500-repro-5@example.com',
  'good-data-500-test@example.com',
];

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

  const staffRows: { id: string; email: string }[] = await ds.query(
    `SELECT id, email FROM staff WHERE email = ANY($1)`,
    [TEST_EMAILS],
  );
  const userRows: { id: string; email: string }[] = await ds.query(
    `SELECT id, email FROM "user" WHERE email = ANY($1)`,
    [TEST_EMAILS],
  );

  console.log(`Found ${staffRows.length} staff row(s) and ${userRows.length} user row(s) to remove:`);
  console.table([...staffRows.map((r) => ({ table: 'staff', ...r })), ...userRows.map((r) => ({ table: 'user', ...r }))]);

  if (!isExecute) {
    console.log('\n(dry run, not applied)');
    await ds.destroy();
    return;
  }

  if (staffRows.length) {
    await ds.query(`DELETE FROM staff WHERE id = ANY($1)`, [staffRows.map((r) => r.id)]);
    console.log(`Deleted ${staffRows.length} staff row(s) (addresses/emergency_contacts cascade on delete).`);
  }
  if (userRows.length) {
    await ds.query(`DELETE FROM "user" WHERE id = ANY($1)`, [userRows.map((r) => r.id)]);
    console.log(`Deleted ${userRows.length} user row(s).`);
  }

  await ds.destroy();
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
