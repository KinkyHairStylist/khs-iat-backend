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
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await AppDataSource.initialize();
  const users = await AppDataSource.query('SELECT id, email, "isMerchant" FROM "user" WHERE "isMerchant" = true LIMIT 5');
  console.log("Merchants:", users);
  await AppDataSource.destroy();
}

main().catch(console.error);
