/**
 * ONE-OFF MIGRATION SCRIPT — creates the tickets table and adds ticketId
 * to chat_messages, for the support-chat ticketing feature.
 *
 * TypeORM's synchronize() is never actually invoked at boot in this repo
 * (app.module.ts wires TypeOrmModule.forRoot directly, bypassing the
 * SYNC_ONLY_TABLES mechanism documented in src/config/database.ts), so new
 * tables/columns need a manual script like this one.
 *
 * Run with:
 *   npx ts-node scripts/add-tickets-table.ts
 */
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

  await client.query(`
    DO $$ BEGIN
      CREATE TYPE tickets_status_enum AS ENUM ('open', 'closed');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log('tickets_status_enum type ensured.');

  // customerId/assignedAdminId/closedById must be uuid, matching User.id's
  // column type (@PrimaryGeneratedColumn('uuid')) — Postgres has no
  // implicit uuid = varchar comparison, so TypeORM's relation queries
  // (e.g. WHERE customer.id = :id) fail at runtime with a varchar column.
  await client.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "ticketNumber" varchar UNIQUE NOT NULL,
      "customerId" uuid NOT NULL,
      "assignedAdminId" uuid NULL,
      status tickets_status_enum NOT NULL DEFAULT 'open',
      "closedById" uuid NULL,
      "closedAt" timestamp NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );
  `);
  console.log('tickets table ensured.');

  await client.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS "ticketId" uuid NULL;
  `);
  console.log('ticketId column added to chat_messages (or already existed).');

  await client.query(`
    CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1001;
  `);
  console.log('ticket_number_seq sequence ensured.');

  await client.end();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
