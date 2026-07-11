import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

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

  const adminRoleExists = await client.query(`
    SELECT 1 FROM pg_type WHERE typname = 'user_adminrole_enum';
  `);
  if (adminRoleExists.rowCount === 0) {
    await client.query(`
      CREATE TYPE user_adminrole_enum AS ENUM ('super_admin', 'admin');
    `);
    console.log('Created enum type: user_adminrole_enum');
  } else {
    console.log('Enum type user_adminrole_enum already exists, skipping.');
  }

  const staffRoleExists = await client.query(`
    SELECT 1 FROM pg_type WHERE typname = 'user_businessstaffrole_enum';
  `);
  if (staffRoleExists.rowCount === 0) {
    await client.query(`
      CREATE TYPE user_businessstaffrole_enum AS ENUM ('manager', 'stylist', 'receptionist', 'cashier');
    `);
    console.log('Created enum type: user_businessstaffrole_enum');
  } else {
    console.log('Enum type user_businessstaffrole_enum already exists, skipping.');
  }

  await client.query(`
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS "adminRole" user_adminrole_enum NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS "isMerchant" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "isBusinessStaff" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "businessStaffRole" user_businessstaffrole_enum NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS "isCustomer" boolean NOT NULL DEFAULT true;
  `);
  console.log('All five User columns added (or already existed).');

  await client.end();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});