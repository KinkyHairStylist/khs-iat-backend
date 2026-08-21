import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'khs',
  ssl:
    process.env.DB_SSL === 'require' || process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
});

async function main() {
  await AppDataSource.initialize();
  const businessId = '3c3cbb4d-6bc2-4379-a85d-8e86b4ac7857';
  await AppDataSource.query('DELETE FROM "Service" WHERE "businessId" = $1', [businessId]);
  const deleteResult = await AppDataSource.query('DELETE FROM "businesses" WHERE id = $1 AND status = $2', [businessId, 'pending']);
  console.log("Delete result:", deleteResult);
  await AppDataSource.destroy();
}

main().catch(console.error);
