import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const FIXES: { constraint: string; table: string; column: string; action: string }[] = [
  // user_status is tied to the user — delete with user
  { constraint: 'FK_3f59e14edbec8fbf03dc4f4348e', table: 'user_status', column: '"userId"', action: 'CASCADE' },
  // chat_messages — keep messages for other participants
  { constraint: 'FK_9a197c82c9ea44d75bc145a6e2c', table: 'chat_messages', column: '"receiverId"', action: 'SET NULL' },
  { constraint: 'FK_fc6b58e41e9a871dacbe9077def', table: 'chat_messages', column: '"senderId"', action: 'SET NULL' },
  // flagged_content — keep reports for audit
  { constraint: 'FK_c3af5e40c8f1de72ccc96172ae9', table: 'flagged_content', column: '"reporterId"', action: 'SET NULL' },
  { constraint: 'FK_c3c0a161ab6f2032779b149fd08', table: 'flagged_content', column: '"reportedId"', action: 'SET NULL' },
  // subscription is tied to the user
  { constraint: 'FK_cc906b4bc892b048f1b654d2aa0', table: 'subscription', column: '"userId"', action: 'CASCADE' },
];

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await client.connect();
  console.log('Connected.');

  for (const fix of FIXES) {
    const exists = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = $1 AND contype = 'f'`,
      [fix.constraint],
    );
    if (exists.rowCount === 0) {
      console.log(`  ⏭️  "${fix.constraint}" not found — skipping`);
      continue;
    }

    const delType = await client.query(
      `SELECT confdeltype FROM pg_constraint WHERE conname = $1`,
      [fix.constraint],
    );
    const currentAction = delType.rows[0]?.confdeltype;
    const actionLabel = currentAction === 'c' ? 'CASCADE' : currentAction === 'a' ? 'NO ACTION' : currentAction === 'r' ? 'RESTRICT' : currentAction === 'n' ? 'SET NULL' : '?';

    if (currentAction === 'c' && fix.action === 'CASCADE') {
      console.log(`  ✅ "${fix.constraint}" on ${fix.table} already has CASCADE`);
      continue;
    }
    if (currentAction === 'n' && fix.action === 'SET NULL') {
      console.log(`  ✅ "${fix.constraint}" on ${fix.table} already has SET NULL`);
      continue;
    }
    if (currentAction === 'a' && fix.action === 'NO ACTION') {
      console.log(`  ✅ "${fix.constraint}" on ${fix.table} already has NO ACTION`);
      continue;
    }

    console.log(`  🔧 "${fix.constraint}" on ${fix.table}(${fix.column}) — changing ${actionLabel} → ${fix.action}`);

    const refInfo = await client.query(
      `SELECT confrelid::regclass AS ref_table, pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE conname = $1`,
      [fix.constraint],
    );
    const def = refInfo.rows[0]?.def || '';

    await client.query(`ALTER TABLE "${fix.table}" DROP CONSTRAINT "${fix.constraint}"`);
    await client.query(
      `ALTER TABLE "${fix.table}" ADD CONSTRAINT "${fix.constraint}" FOREIGN KEY (${fix.column}) REFERENCES "user"(id) ON DELETE ${fix.action}`,
    );
    console.log(`  ✅ Done`);
  }

  await client.end();
  console.log('\nAll FK constraints updated.');
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
