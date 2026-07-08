import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await client.connect();
  console.log('Connected to database.');

  const result = await client.query(`
    UPDATE "user"
    SET "isStaff" = true, "adminRole" = 'super_admin'
    WHERE email = 'admin@local.test'
    RETURNING id, email, "isStaff", "adminRole";
  `);

  console.log('Updated rows:');
  console.table(result.rows);

  await client.end();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
