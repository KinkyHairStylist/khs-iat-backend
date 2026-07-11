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
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

async function main() {
  await AppDataSource.initialize();

  const result = await AppDataSource.query(`
    SELECT enumlabel
    FROM pg_enum
    WHERE enumtypid = 'staff_role_enum'::regtype
    ORDER BY enumsortorder;
  `);

  console.log('Current values in staff_role_enum:');
  console.log(result.map((r: any) => r.enumlabel));

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Query failed:', err.message);
  process.exit(1);
});
