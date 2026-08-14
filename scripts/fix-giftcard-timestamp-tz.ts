import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'require' || process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
});

async function fixGiftCardTimestampTz() {
  await AppDataSource.initialize();
  console.log('Connected to database. Altering business_gift_cards timestamp columns to timestamptz...');

  await AppDataSource.query(`
    ALTER TABLE "business_gift_cards"
    ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';
  `);

  console.log('✅ Successfully updated business_gift_cards timestamp columns to timestamp with time zone!');
  await AppDataSource.destroy();
}

fixGiftCardTimestampTz().catch((err) => {
  console.error('❌ Failed to alter timestamp columns:', err);
  process.exit(1);
});
