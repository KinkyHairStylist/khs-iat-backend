import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// The "Service" table's price column was left as integer, but the entity
// declares it decimal(10,2) (matching minPrice/maxPrice, which are already
// numeric). Any non-whole-number price (e.g. 45.99) throws an uncaught
// Postgres error (22P02, pg_strtoint32_safe) trying to insert a decimal
// string into an integer column, surfacing as a raw 500 to the user. This
// widens the column to match the entity.

const run = async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  await client.connect();
  console.log('Connected.');

  try {
    await client.query(
      'ALTER TABLE "Service" ALTER COLUMN price TYPE numeric(10,2)',
    );

    const res = await client.query(
      `SELECT column_name, data_type, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_name = 'Service' AND column_name IN ('price', 'minPrice', 'maxPrice')`,
    );
    console.table(res.rows);
    console.log('✅ Service.price widened to numeric(10,2).');
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('Failed to fix Service.price column type:', error);
  process.exitCode = 1;
});
