import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { typeOrmConfig } from '../src/config/database';
dotenv.config();

async function dropAllIndexes() {
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

    const res = await client.query(
      `SELECT indexname, tablename FROM pg_indexes WHERE indexname LIKE 'IDX_%';`,
    );

    for (const row of res.rows) {
      console.log(`Dropping index ${row.indexname} on table ${row.tablename}`);
      await client.query(`DROP INDEX IF EXISTS "${row.indexname}"`);
    }

    console.log('All TypeORM-generated indexes dropped successfully');
  } catch (err) {
    console.error('Error dropping indexes:', err);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

dropAllIndexes();
