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
  console.log('Connected.');

  const res = await client.query(`
    SELECT conname, conrelid::regclass AS table_name,
           pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE confrelid = 'user'::regclass AND contype = 'f'
    ORDER BY conname
  `);

  if (res.rows.length === 0) {
    console.log('No FK constraints referencing user table found.');
  } else {
    console.table(res.rows);
  }

  await client.end();
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
