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
  const users = await ds.query('SELECT email, "isVerified" FROM "user" WHERE email = \'owner1@business1.com\'');
  console.log('RESULT:', users);
  process.exit(0);
});
