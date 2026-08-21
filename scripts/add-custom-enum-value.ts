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
  ssl:
    process.env.DB_SSL === 'require' || process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
});

async function addCustomEnumValue() {
  await AppDataSource.initialize();
  console.log(
    'Connected to database. Altering postgres enum type business_gift_cards_template_enum...',
  );

  await AppDataSource.query(`
    ALTER TYPE "public"."business_gift_cards_template_enum" ADD VALUE IF NOT EXISTS 'custom';
  `);

  console.log(
    'Successfully added "custom" value to business_gift_cards_template_enum!',
  );
  await AppDataSource.destroy();
}

addCustomEnumValue().catch((err) => {
  console.error('Failed to alter enum type:', err);
  process.exit(1);
});
