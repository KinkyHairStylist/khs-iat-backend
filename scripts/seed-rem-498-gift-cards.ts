import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// Seeds one gift card for the known test merchant (alt.rl-61irtmx@yopmail.com)
// and one for a different, unrelated merchant. Used to verify REM-498/499:
// the Gift Cards page summary/list must only reflect the logged-in
// merchant's own cards, not every merchant's.

const TEST_MERCHANT_EMAIL = 'alt.rl-61irtmx@yopmail.com';

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
    const merchantBusiness = await client.query<{ id: string }>(
      `SELECT b.id FROM businesses b
       JOIN "user" u ON b.owner_id = u.id
       WHERE u.email = $1`,
      [TEST_MERCHANT_EMAIL],
    );

    if (merchantBusiness.rows.length === 0) {
      throw new Error(
        `Test merchant ${TEST_MERCHANT_EMAIL} not found. Run seed:appointments first.`,
      );
    }

    const otherBusiness = await client.query<{ id: string; businessName: string }>(
      `SELECT b.id, b."businessName" FROM businesses b
       JOIN "user" u ON b.owner_id = u.id
       WHERE u.email != $1
       LIMIT 1`,
      [TEST_MERCHANT_EMAIL],
    );

    if (otherBusiness.rows.length === 0) {
      throw new Error('No other merchant business found to seed a control card.');
    }

    const insertCard = async (businessId: string, title: string, code: string) => {
      await client.query(
        `INSERT INTO business_gift_cards (
          "businessId", title, description, amount, "remainingAmount",
          benefits, code, template, "expiryInDays", "expiresAt",
          status, "soldStatus", "sentStatus", "recipientName", "recipientEmail"
        ) VALUES (
          $1, $2, 'Seeded for REM-498/499 testing', 100, 100,
          'Redeemable for any service', $3, 'general', 365, NOW() + INTERVAL '365 days',
          'Active', 'available', 'pending', 'Test Recipient', 'recipient@example.com'
        )
        ON CONFLICT (code) DO NOTHING`,
        [businessId, title, code],
      );
    };

    await insertCard(
      merchantBusiness.rows[0].id,
      'Test merchant gift card',
      'KSHTEST1',
    );
    await insertCard(
      otherBusiness.rows[0].id,
      `Control card for ${otherBusiness.rows[0].businessName}`,
      'KSHTEST2',
    );

    console.log('✅ Seeded 1 gift card for the test merchant and 1 for a different merchant.');
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('Failed to seed REM-498 gift cards:', error);
  process.exitCode = 1;
});
