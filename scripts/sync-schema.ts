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
  ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false,
});

async function main() {
  console.log('Connecting to Neon database for raw alter table query...');
  await AppDataSource.initialize();
  
  console.log('Altering businesses table to add revenueGoal column...');
  await AppDataSource.query(
    'ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "revenueGoal" numeric(10,2) DEFAULT \'10000.00\';'
  );
  
  console.log('Successfully altered table! Destroying connection...');
  await AppDataSource.destroy();
  console.log('Done!');
}

main().catch((err) => {
  console.error('Error during raw schema sync:', err);
  process.exit(1);
});
