import { DataSource } from 'typeorm';
import 'dotenv/config';

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

ds.initialize().then(async () => {
  await ds.query('UPDATE "user" SET "isVerified" = true WHERE email = \'owner1@business1.com\'');
  await ds.query('UPDATE businesses SET status = \'approved\' WHERE "ownerEmail" = \'owner1@business1.com\'');
  console.log('Fixed owner1!');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
