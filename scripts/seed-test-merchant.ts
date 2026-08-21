/**
 * ONE-OFF LOCAL DEV SCRIPT — creates a verified, approved merchant user
 * (plus its Business row) directly in the DB, for testing the merchant
 * dashboard/support-chat flow.
 *
 * Business.status is set to 'approved' directly — otherwise the merchant
 * dashboard would be stuck behind the under-review flow with nothing to
 * test against.
 *
 * NOT for staging/production use — local testing only.
 *
 * Run with:
 *   npx ts-node scripts/seed-test-merchant.ts
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

const EMAIL = 'test-merchant@khs.local';
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

async function seedTestMerchant() {
  await AppDataSource.initialize();
  console.log('Database connected');

  const existingUser = await AppDataSource.query(
    `SELECT id FROM "user" WHERE email = $1`,
    [EMAIL],
  );

  let userId: string;

  if (existingUser.length > 0) {
    userId = existingUser[0].id;
    console.log(`Merchant user already exists: ${EMAIL} (id: ${userId})`);
  } else {
    const hash = await bcrypt.hash(PASSWORD, await bcrypt.genSalt(10));

    const result = await AppDataSource.query(
      `INSERT INTO "user" (
        email, password, "firstName", surname,
        "isVerified", "isStaff", "adminRole",
        "isMerchant", "isBusinessStaff", "businessStaffRole", "isCustomer",
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING id`,
      [
        EMAIL,
        hash,
        'Test',
        'Merchant',
        true, // isVerified
        false, // isStaff
        null, // adminRole
        true, // isMerchant
        false, // isBusinessStaff
        null, // businessStaffRole
        true // isCustomer
      ],
    );
    userId = result[0].id;
    console.log(`Created merchant user: ${EMAIL} (id: ${userId})`);
  }

  const existingBusiness = await AppDataSource.query(
    `SELECT id FROM businesses WHERE owner_id = $1`,
    [userId],
  );

  if (existingBusiness.length > 0) {
    console.log(`Business already exists (id: ${existingBusiness[0].id})`);
  } else {
    const business = await AppDataSource.query(
      `INSERT INTO businesses (
        "businessName", description, owner_id, "ownerName", "ownerEmail",
        "primaryAudience", "companySize", status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        'Test Merchant Salon',
        'Seeded test business for merchant-side dev/testing.',
        userId,
        'Test Merchant',
        EMAIL,
        'Everyone',
        'solo',
        'approved',
      ],
    );
    console.log(`Created business: Test Merchant Salon (id: ${business[0].id})`);
  }

  console.log(`Login with password: ${PASSWORD}`);

  await AppDataSource.destroy();
}

seedTestMerchant().catch((error) => {
  console.error('Failed to seed test merchant:', error.message);
  process.exit(1);
});
