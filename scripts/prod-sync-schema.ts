import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const ssl = process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false;
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl,
  });
  await client.connect();
  console.log('Connected.');

  // ── Step 1: Create PostgreSQL enum types ──────────────────────────────
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE user_adminrole_enum AS ENUM ('super_admin', 'admin');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE user_businessstaffrole_enum AS ENUM ('manager', 'stylist', 'receptionist', 'cashier');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  console.log('Enum types OK.');

  // ── Step 2: Add missing columns to user table ───────────────────────
  await client.query(`
    ALTER TABLE "user"
    ADD COLUMN IF NOT EXISTS "adminRole" user_adminrole_enum DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS "isMerchant" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "isBusinessStaff" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "businessStaffRole" user_businessstaffrole_enum DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS "isCustomer" boolean NOT NULL DEFAULT true;
  `);
  console.log('User columns OK.');

  // ── Step 3: Add missing columns to businesses table ──────────────────
  await client.query(`
    ALTER TABLE "businesses"
    ADD COLUMN IF NOT EXISTS "isLuxury" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "luxuryOverride" boolean DEFAULT NULL;
  `);
  console.log('Businesses columns OK.');

  // ── Step 4: Add missing columns to staff table ───────────────────────
  await client.query(`
    ALTER TABLE "staff"
    ADD COLUMN IF NOT EXISTS "userId" varchar NULL;
  `);
  console.log('Staff columns OK.');

  // ── Step 5: Create missing landing / utility tables ──────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "email" character varying NOT NULL,
      "subscribedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_newsletter_subscribers" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_newsletter_subscribers_email" UNIQUE ("email")
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "testimonials" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "name" character varying NOT NULL,
      "role" character varying,
      "content" text NOT NULL,
      "rating" integer NOT NULL DEFAULT 5,
      "avatar" character varying,
      "isApproved" boolean NOT NULL DEFAULT false,
      "isRejected" boolean NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_testimonials" PRIMARY KEY ("id")
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "landing_statistics" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "label" character varying NOT NULL,
      "description" text NOT NULL,
      "icon" character varying,
      "displayOrder" integer NOT NULL DEFAULT 0,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_landing_statistics" PRIMARY KEY ("id")
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "faqs" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "question" character varying NOT NULL,
      "answer" text NOT NULL,
      "category" character varying,
      "displayOrder" integer NOT NULL DEFAULT 0,
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_faqs" PRIMARY KEY ("id")
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "blog_posts" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "title" character varying NOT NULL,
      "slug" character varying NOT NULL,
      "excerpt" text,
      "content" text NOT NULL,
      "coverImage" character varying,
      "author" character varying,
      "isPublished" boolean NOT NULL DEFAULT false,
      "publishedAt" timestamptz,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_blog_posts" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_blog_posts_slug" UNIQUE ("slug")
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "stories" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "name" character varying NOT NULL,
      "role" character varying,
      "quote" text NOT NULL,
      "image" character varying,
      "isPublished" boolean NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_stories" PRIMARY KEY ("id")
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "phone_verifications" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "phoneNumber" character varying NOT NULL,
      "otp" character varying(6) NOT NULL,
      "expiresAt" timestamptz NOT NULL,
      "trials" integer NOT NULL DEFAULT 0,
      "maxTrials" integer NOT NULL DEFAULT 5,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_phone_verifications" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_phone_verifications_phoneNumber" UNIQUE ("phoneNumber")
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS "IDX_phone_verifications_phoneNumber" ON "phone_verifications" ("phoneNumber");
  `);

  console.log('All tables created / verified.');

  await client.end();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
