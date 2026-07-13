// import { Client } from 'pg';
// import * as dotenv from 'dotenv';
// import { typeOrmConfig } from '../src/config/database';

// dotenv.config();

// const cleanup = async (idToDelete: string) => {
//   const config = typeOrmConfig as {
//     host: string;
//     port: number;
//     username: string;
//     password: string;
//     database: string;
//     ssl?: any;
//   };

//   const client = new Client({
//     host: config.host,
//     port: config.port,
//     user: config.username,
//     password: config.password,
//     database: config.database,
//     ssl: config.ssl || false,
//   });

//   try {
//     console.log('📡 Connecting to database...');
//     await client.connect();
//     console.log('✅ Connected!');

//     // Check if record exists
//     const checkRes = await client.query(
//       'SELECT * FROM businesses WHERE id = $1',
//       [idToDelete],
//     );
//     if (checkRes.rowCount === 0) {
//       console.log(`⚠️ No business record found with id ${idToDelete}`);
//       await client.end();
//       return;
//     }

//     // Delete the specific record
//     console.log(`🗑  Deleting business with id ${idToDelete}...`);
//     await client.query('DELETE FROM businesses WHERE id = $1', [idToDelete]);
//     console.log('✅ Deleted successfully!');

//     await client.end();
//     console.log('✅ Done!');
//   } catch (error) {
//     console.error('❌ Error:', error.message);
//     process.exit(1);
//   }
// };

// // Replace with the actual id you want to delete
// cleanup('1f8a8e59-a55a-4c20-9f5b-0c82c4c03a80');

// import { Client } from 'pg';
// import * as dotenv from 'dotenv';
// import { typeOrmConfig } from '../src/config/database';

// dotenv.config();

// const fetchAllBusinesses = async () => {
//   const config = typeOrmConfig as {
//     host: string;
//     port: number;
//     username: string;
//     password: string;
//     database: string;
//     ssl?: any;
//   };

//   const client = new Client({
//     host: config.host,
//     port: config.port,
//     user: config.username,
//     password: config.password,
//     database: config.database,
//     ssl: config.ssl || false,
//   });

//   try {
//     console.log('📡 Connecting to database...');
//     await client.connect();
//     console.log('✅ Connected!');

//     const res = await client.query('SELECT * FROM business');
//     console.log(`📊 Found ${res.rowCount} businesses:`);
//     console.table(res.rows); // nice formatted table

//     await client.end();
//     console.log('✅ Done!');
//   } catch (error) {
//     console.error('❌ Error:', error.message);
//     process.exit(1);
//   }
// };

// fetchAllBusinesses();

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { typeOrmConfig } from '../src/config/database';

dotenv.config();

const cleanup = async (businessId: string) => {
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

    // Check if business exists
    const checkRes = await client.query(
      'SELECT * FROM businesses WHERE id = $1',
      [businessId],
    );
    if (checkRes.rowCount === 0) {
      console.log(`⚠️ No business found with id ${businessId}`);
      await client.end();
      return;
    }

    // Delete transactions linked to business wallets
    console.log('🗑  Deleting related transactions...');
    await client.query(
      `
      DELETE FROM transactions
      WHERE wallet_id IN (
        SELECT id FROM business_wallets WHERE business_id = $1
      )
    `,
      [businessId],
    );

    // Delete payment methods linked to business wallets
    console.log('🗑  Deleting related payment methods...');
    await client.query(
      `
      DELETE FROM payment_methods
      WHERE wallet_id IN (
        SELECT id FROM business_wallets WHERE business_id = $1
      )
    `,
      [businessId],
    );

    // Delete business wallets
    console.log('🗑  Deleting related business wallets...');
    await client.query('DELETE FROM business_wallets WHERE business_id = $1', [
      businessId,
    ]);

    // Finally delete the business
    console.log(`🗑  Deleting business with id ${businessId}...`);
    await client.query('DELETE FROM businesses WHERE id = $1', [businessId]);

    console.log('✅ Deleted successfully!');
    await client.end();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

// Replace with your business ID
cleanup('1f8a8e59-a55a-4c20-9f5b-0c82c4c03a80');
