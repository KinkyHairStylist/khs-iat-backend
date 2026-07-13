import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { typeOrmConfig } from '../src/config/database';
dotenv.config();

async function dropAppointmentOrderIdUniqueConstraint() {
  const config = typeOrmConfig as {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl?: any;
  };

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl || false,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    console.log('Dropping unique constraint UQ_7c0895c5f54bb4babd5aa7e0ebd on appointments.orderId');
    await client.query(`ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "UQ_7c0895c5f54bb4babd5aa7e0ebd"`);

    console.log('Unique constraint dropped successfully');
  } catch (err) {
    console.error('Error dropping constraint:', err);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

dropAppointmentOrderIdUniqueConstraint();
