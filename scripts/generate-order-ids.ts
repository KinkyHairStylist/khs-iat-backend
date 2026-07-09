import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { typeOrmConfig } from '../src/config/database';

dotenv.config();

const generateOrderIds = async () => {
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

    // Check count of appointments without orderId
    const countRes = await client.query(
      'SELECT COUNT(*) FROM appointments WHERE "orderId" IS NULL',
    );
    console.log(`📊 Found ${countRes.rows[0].count} appointments without orderId`);

    const count = parseInt(countRes.rows[0].count);
    if (count === 0) {
      console.log('✅ All appointments already have orderIds!');
      await client.end();
      return;
    }

    // Get all appointments without orderId
    const appointmentsRes = await client.query(
      'SELECT id FROM appointments WHERE "orderId" IS NULL ORDER BY "createdAt" ASC',
    );

    console.log(`🔄 Generating orderIds for ${count} appointments...`);

    // Generate unique orderIds and update
    const usedOrderIds = new Set();
    let updated = 0;

    for (const row of appointmentsRes.rows) {
      let orderId;
      do {
        orderId = `BKID-${Math.floor(1000000 + Math.random() * 9000000)}`;
      } while (usedOrderIds.has(orderId));

      usedOrderIds.add(orderId);

      await client.query(
        'UPDATE appointments SET "orderId" = $1 WHERE id = $2',
        [orderId, row.id],
      );

      updated++;

      if (updated % 10 === 0) {
        console.log(`📝 Updated ${updated}/${count} appointments`);
      }
    }

    console.log('✅ All appointments updated with orderIds!');
    await client.end();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

generateOrderIds();
