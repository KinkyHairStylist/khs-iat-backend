import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { typeOrmConfig } from '../src/config/database';

dotenv.config();

const cleanup = async () => {
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
    console.log('📡 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!');

    // Check count
    const countRes = await client.query(
      'SELECT COUNT(*) FROM business_wallets',
    );
    console.log(`📊 Found ${countRes.rows[0].count} business_wallets`);

    // Delete
    console.log('🗑  Deleting...');
    await client.query('DELETE FROM business_wallets');
    console.log('✅ Deleted!');

    await client.end();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

cleanup();
