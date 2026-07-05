/**
 * ONE-OFF LOCAL DEV SCRIPT — creates a super-admin user directly in the DB.
 *
 * Why this exists: AdminAuthController.register() requires a valid invite
 * token, and inviting an admin requires an already-authenticated admin
 * (AdminAuthGuard + RolesGuard) — a chicken-and-egg problem on a fresh local
 * DB with zero admins. This bypasses that by inserting the row directly,
 * using the same bcrypt hashing the real login flow expects.
 *
 * NOT for staging/production use — local testing only.
 *
 * Run with:
 *   npx ts-node scripts/seed-admin.ts
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

const EMAIL = 'test-admin@khs.local';
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

async function seedAdmin() {
  await AppDataSource.initialize();
  console.log('Database connected');

  const existing = await AppDataSource.query(
    `SELECT id FROM "user" WHERE email = $1`,
    [EMAIL],
  );

  if (existing.length > 0) {
    console.log(`Admin already exists: ${EMAIL} (id: ${existing[0].id})`);
    console.log(`Login with password: ${PASSWORD}`);
    await AppDataSource.destroy();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, await bcrypt.genSalt(10));

  const result = await AppDataSource.query(
    `INSERT INTO "user" (
      email, password, "firstName", surname,
      "isVerified", "isSuperAdmin", "isAdmin",
      "isBusiness", "isClient", "isManager", "isBusinessAdmin", "isStaff",
      "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
    RETURNING id`,
    [
      EMAIL,
      hash,
      'Test',
      'Admin',
      true, // isVerified
      true, // isSuperAdmin
      false, // isAdmin
      false, // isBusiness
      false, // isClient
      false, // isManager
      false, // isBusinessAdmin
      false, // isStaff
    ],
  );

  console.log(`Created super-admin: ${EMAIL} (id: ${result[0].id})`);
  console.log(`Login with password: ${PASSWORD}`);

  await AppDataSource.destroy();
}

seedAdmin().catch((error) => {
  console.error('Failed to seed admin:', error.message);
  process.exit(1);
});
