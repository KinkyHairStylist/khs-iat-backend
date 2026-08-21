/**
 * ONE-OFF LOCAL DEV SCRIPT — creates a verified customer user directly in
 * the DB, for testing the customer-side chat flow against the seeded
 * admin from seed-admin.ts.
 *
 * NOT for staging/production use — local testing only.
 *
 * Run with:
 *   npx ts-node scripts/seed-test-customer.ts
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

const EMAIL = 'test-customer@khs.local';
const PASSWORD = 'TestPassword123!';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'khs',
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

async function seedTestCustomer() {
  await AppDataSource.initialize();
  console.log('Database connected');

  const existing = await AppDataSource.query(
    `SELECT id FROM "user" WHERE email = $1`,
    [EMAIL],
  );

  if (existing.length > 0) {
    console.log(`Customer already exists: ${EMAIL} (id: ${existing[0].id})`);
    console.log(`Login with password: ${PASSWORD}`);
    await AppDataSource.destroy();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, await bcrypt.genSalt(10));

  const result = await AppDataSource.query(
    `INSERT INTO "user" (
      email, password, "firstName", surname,
      "isVerified", "isSuperAdmin", "isAdmin",
      "isBusiness", "isClient", "isCustomer", "isManager", "isBusinessAdmin", "isStaff",
      "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
    RETURNING id`,
    [
      EMAIL,
      hash,
      'Test',
      'Customer',
      true, // isVerified
      false, // isSuperAdmin
      false, // isAdmin
      false, // isBusiness
      true, // isClient
      true, // isCustomer
      false, // isManager
      false, // isBusinessAdmin
      false, // isStaff
    ],
  );

  console.log(`Created test customer: ${EMAIL} (id: ${result[0].id})`);
  console.log(`Login with password: ${PASSWORD}`);

  await AppDataSource.destroy();
}

seedTestCustomer().catch((error) => {
  console.error('Failed to seed test customer:', error.message);
  process.exit(1);
});
