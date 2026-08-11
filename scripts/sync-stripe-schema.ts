import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false,
});

async function main() {
  console.log('Connecting to database for Stripe escrow schema sync...');
  await AppDataSource.initialize();

  console.log('Adding Stripe value to transactions_method_enum...');
  // Postgres doesn't support IF NOT EXISTS on ADD VALUE before PG 12; this
  // repo's target is modern Postgres (Neon), so the plain form is fine —
  // wrap in a DO block to make it idempotent across re-runs regardless.
  await AppDataSource.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'Stripe'
        AND enumtypid = 'transactions_method_enum'::regtype
      ) THEN
        ALTER TYPE transactions_method_enum ADD VALUE 'Stripe';
      END IF;
    END$$;
  `);

  console.log('Creating stripe_escrow_status_enum...');
  await AppDataSource.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stripe_payment_intents_status_enum') THEN
        CREATE TYPE stripe_payment_intents_status_enum AS ENUM (
          'pending', 'held', 'released', 'refunded', 'partially_refunded', 'failed', 'cancelled'
        );
      END IF;
    END$$;
  `);

  console.log('Creating stripe_payment_intents table...');
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS stripe_payment_intents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "orderId" varchar(100) NOT NULL,
      "businessId" uuid NOT NULL,
      "userId" uuid NOT NULL,
      "stripePaymentIntentId" varchar(255) NOT NULL,
      "stripeChargeId" varchar(255),
      amount numeric(12,2) NOT NULL,
      currency varchar(3) NOT NULL DEFAULT 'usd',
      "bookingAmount" numeric(12,2) NOT NULL,
      "feeAmount" numeric(12,2) NOT NULL DEFAULT 0,
      status stripe_payment_intents_status_enum NOT NULL DEFAULT 'pending',
      "heldAt" timestamptz,
      "releasedAt" timestamptz,
      "refundedAt" timestamptz,
      "transactionId" uuid,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
  `);

  console.log('Adding indexes...');
  await AppDataSource.query(`
    CREATE INDEX IF NOT EXISTS "IDX_stripe_payment_intents_orderId" ON stripe_payment_intents ("orderId");
  `);
  await AppDataSource.query(`
    CREATE INDEX IF NOT EXISTS "IDX_stripe_payment_intents_businessId" ON stripe_payment_intents ("businessId");
  `);
  await AppDataSource.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IDX_stripe_payment_intents_stripePaymentIntentId" ON stripe_payment_intents ("stripePaymentIntentId");
  `);

  console.log('Schema sync complete. Destroying connection...');
  await AppDataSource.destroy();
  console.log('Done!');
}

main().catch((err) => {
  console.error('Error during Stripe schema sync:', err);
  process.exit(1);
});
