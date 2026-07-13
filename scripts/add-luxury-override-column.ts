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
    ALTER TABLE businesses
    ADD COLUMN IF NOT EXISTS "luxuryOverride" boolean NULL DEFAULT NULL;
  `);
  console.log('luxuryOverride column added (or already existed).');

  await client.end();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
