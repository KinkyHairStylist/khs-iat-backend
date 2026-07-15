const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'khs',
    ssl: false,
  });

  await client.connect();
  console.log('Connected to DB');

  // Create enum type if it doesn't exist
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE price_type_enum AS ENUM ('fixed', 'variable');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log('✅ price_type_enum type ensured');

  await client.query(`
    ALTER TABLE "Service"
      ADD COLUMN IF NOT EXISTS "priceType" price_type_enum DEFAULT 'fixed',
      ADD COLUMN IF NOT EXISTS "minPrice" numeric(10,2),
      ADD COLUMN IF NOT EXISTS "maxPrice" numeric(10,2);
  `);
  console.log('✅ priceType, minPrice, maxPrice columns added to Service table');

  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
