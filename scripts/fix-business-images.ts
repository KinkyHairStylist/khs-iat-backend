import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const businessImages = [
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
  'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=800',
  'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800',
  'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=800',
];

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'khs',
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected');

  const businesses = await AppDataSource.query(
    `SELECT id FROM businesses WHERE "businessImage" LIKE '[%'`,
  );

  console.log(`Found ${businesses.length} businesses with malformed images`);

  for (let i = 0; i < businesses.length; i++) {
    const images = [
      businessImages[i % businessImages.length],
      businessImages[(i + 1) % businessImages.length],
      businessImages[(i + 2) % businessImages.length],
    ].join(',');

    await AppDataSource.query(
      `UPDATE businesses SET "businessImage" = $1 WHERE id = $2`,
      [images, businesses[i].id],
    );
  }

  console.log(`Fixed ${businesses.length} businesses`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Fix failed:', err);
  process.exit(1);
});
