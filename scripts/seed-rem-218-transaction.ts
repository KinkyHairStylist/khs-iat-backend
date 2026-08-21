import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// Seeds one completed transaction with a long description for the seeded
// client (alt.dk-64090mj@yopmail.com, from seed-appointment-management.ts).
// Used to verify REM-218: the receipt modal's Description row must wrap
// the full text instead of truncating with an ellipsis.

const CLIENT_EMAIL = 'alt.dk-64090mj@yopmail.com';
const LONG_DESCRIPTION =
  'Card payment for membership renewal - Premium Annual Plan including ' +
  'monthly styling consultation and priority booking access';

const run = async () => {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  await client.connect();
  console.log('Connected.');

  try {
    const userRes = await client.query<{ id: string }>(
      'SELECT id FROM "user" WHERE email = $1',
      [CLIENT_EMAIL],
    );

    if (userRes.rows.length === 0) {
      throw new Error(
        `Client ${CLIENT_EMAIL} not found. Run seed:appointments first.`,
      );
    }

    const clientId = userRes.rows[0].id;

    const res = await client.query(
      `
        INSERT INTO transactions (
          "senderId", amount, reason, currency, type,
          description, status, method, mode
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, description
      `,
      [
        clientId,
        120.0,
        'Membership payment',
        'NGN',
        'Debit',
        LONG_DESCRIPTION,
        'completed',
        'Card',
        'Web',
      ],
    );

    console.table(res.rows);
    console.log('✅ REM-218 test transaction seeded.');
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('Failed to seed REM-218 test transaction:', error);
  process.exitCode = 1;
});
