import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const CONSTRAINT_NAME = 'FK_1abd8badc4a127b0f357d9ecbc2';

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    // ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('Connected to database.');

  const constraintExists = await client.query(
    `SELECT 1 FROM pg_constraint WHERE conname = $1 AND contype = 'f'`,
    [CONSTRAINT_NAME],
  );

  if (constraintExists.rowCount === 0) {
    console.log(`Foreign key "${CONSTRAINT_NAME}" not found — table may use a different constraint name.`);
    console.log('Skipping. No changes made.');
    await client.end();
    return;
  }

  const alreadyCascades = await client.query(
    `SELECT confupdtype, confdeltype FROM pg_constraint WHERE conname = $1`,
    [CONSTRAINT_NAME],
  );

  if (alreadyCascades.rows[0]?.confdeltype === 'c') {
    console.log(`"${CONSTRAINT_NAME}" already has ON DELETE CASCADE — nothing to do.`);
    await client.end();
    return;
  }

  await client.query(`ALTER TABLE user_address DROP CONSTRAINT "${CONSTRAINT_NAME}"`);
  await client.query(
    `ALTER TABLE user_address ADD CONSTRAINT "${CONSTRAINT_NAME}" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE`,
  );
  console.log(`✅ "${CONSTRAINT_NAME}" updated with ON DELETE CASCADE.`);

  await client.end();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
