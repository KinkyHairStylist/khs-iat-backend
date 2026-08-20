const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'khs',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Connected to database successfully.');

    // Query user info
    const userRes = await client.query(
      `SELECT id, email, "isMerchant", "firstName", surname FROM "user" WHERE email = 'test-merchant@khs.local'`
    );
    console.log('--- User Record ---');
    console.log(userRes.rows);

    // Query business info
    const businessRes = await client.query(
      `SELECT id, "businessName", owner_id, "ownerEmail" FROM businesses`
    );
    console.log('\n--- Business Records ---');
    console.log(businessRes.rows);

  } catch (err) {
    console.error('Error running query:', err);
  } finally {
    await client.end();
  }
}

run();
