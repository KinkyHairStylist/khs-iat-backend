import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

// Cards added via Paystack tokenization never populate cardNumber at all
// (the raw number never reaches this backend) — this column needs to allow
// NULL for those rows. Existing rows are untouched; this only loosens the
// constraint.
async function run() {
  const ssl = process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false;
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl,
  });
  await client.connect();
  console.log('Connected to database.');

  await client.query(`
    ALTER TABLE "card" ALTER COLUMN "cardNumber" DROP NOT NULL;
  `);
  console.log('card.cardNumber is now nullable.');

  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
