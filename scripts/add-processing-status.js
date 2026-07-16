// Run: node scripts/add-processing-status.js
// Adds 'processing' to the transactions_status_enum

require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'postgres',
  };

  console.log('Connecting to:');
  console.log(`  Host: ${config.host}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  User: ${config.user}`);
  console.log('');

  const client = new Client(config);
  await client.connect();

  const res = await client.query('SELECT current_database() AS db');
  console.log(`✓ Connected to database: ${res.rows[0].db}`);

  await client.query(`ALTER TYPE "transactions_status_enum" ADD VALUE IF NOT EXISTS 'processing'`);
  console.log('✓ Added processing to transactions_status_enum');
  await client.end();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
