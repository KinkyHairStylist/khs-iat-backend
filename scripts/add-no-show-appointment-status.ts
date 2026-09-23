import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

// Adds the new 'No Show' value to the appointments.status Postgres enum
// (appointments_status_enum). Run this once against each environment's
// database BEFORE deploying the code that introduces
// AppointmentStatus.NO_SHOW — inserting an appointment/updating its status
// to a value the enum type doesn't yet have will fail at the DB level
// otherwise. Safe to re-run (IF NOT EXISTS).
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl:
    process.env.DB_SSL === 'require' || process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
});

async function addNoShowStatus() {
  await AppDataSource.initialize();
  console.log(
    'Connected to database. Altering postgres enum type appointments_status_enum...',
  );

  await AppDataSource.query(`
    ALTER TYPE "public"."appointments_status_enum" ADD VALUE IF NOT EXISTS 'No Show';
  `);

  console.log('Successfully added "No Show" value to appointments_status_enum!');
  await AppDataSource.destroy();
}

addNoShowStatus().catch((err) => {
  console.error('Failed to alter enum type:', err);
  process.exit(1);
});
