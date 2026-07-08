import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await client.connect();
  console.log('Connected to database.');

  await client.query(`
    ALTER TABLE staff
    ADD COLUMN IF NOT EXISTS "userId" varchar NULL;
  `);
  console.log('userId column added to staff table (or already existed).');

  // Add the unique constraint separately, since ADD COLUMN doesn't support
  // inline UNIQUE the same way, and we want IF NOT EXISTS safety.
  const constraintExists = await client.query(`
    SELECT 1 FROM pg_constraint WHERE conname = 'UQ_staff_userId';
  `);
  if (constraintExists.rowCount === 0) {
    await client.query(`
      ALTER TABLE staff
      ADD CONSTRAINT "UQ_staff_userId" UNIQUE ("userId");
    `);
    console.log('Unique constraint added on staff.userId.');
  } else {
    console.log('Unique constraint on staff.userId already exists, skipping.');
  }

  await client.end();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
