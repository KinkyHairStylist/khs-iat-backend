import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// email_verifications.otp and phone_verifications.otp were left at
// varchar(6) from before OTPs were hashed. OtpService.hashOtp() stores a
// SHA-256 hex digest (64 chars), which the entities already declare
// (@Column({ length: 64 })), but the live schema was never updated to
// match -- every OTP request fails with "value too long for type
// character varying(6)". This widens both columns to match the entities.

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
    await client.query(
      'ALTER TABLE email_verifications ALTER COLUMN otp TYPE character varying(64)',
    );
    await client.query(
      'ALTER TABLE phone_verifications ALTER COLUMN otp TYPE character varying(64)',
    );

    const res = await client.query(
      `SELECT table_name, column_name, character_maximum_length
       FROM information_schema.columns
       WHERE table_name IN ('email_verifications', 'phone_verifications')
         AND column_name = 'otp'`,
    );
    console.table(res.rows);
    console.log('✅ otp columns widened to varchar(64).');
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('Failed to fix otp column length:', error);
  process.exitCode = 1;
});
