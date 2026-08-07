import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

// 10 new, ordinary (non-luxury) salons for testing the /customer/salons
// mixed-grid layout — deliberately kept under the 4.5 luxury rating
// threshold and with no luxuryOverride set, so they land in the plain
// "All salons" grid, not the featured luxury strip.

const businessImages = [
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
  'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=800',
  'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800',
  'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=800',
];

const businessNames = [
  'Glamour Hair Studio',
  'The Hair Lounge',
  'Curls & Coils Salon',
  'Urban Cuts Barbershop',
  'Serene Nails & Beauty',
  'The Style House',
  'Elite Hair Designs',
  'Bloom Beauty Studio',
  'Trendsetters Hair Co.',
  'The Beauty Bar',
];

const cities = [
  { name: 'Lagos', coords: { lat: 6.5244, lng: 3.3792 } },
  { name: 'Abuja', coords: { lat: 9.0765, lng: 7.4983 } },
  { name: 'Port Harcourt', coords: { lat: 4.8156, lng: 7.0498 } },
  { name: 'Ibadan', coords: { lat: 7.3775, lng: 3.947 } },
  { name: 'Kano', coords: { lat: 12.0022, lng: 8.5919 } },
];

const addresses = [
  '15 Admiralty Way, Lekki Phase 1',
  '42 Awoyaya Road, Ajah',
  '78 Allen Avenue, Ikeja',
  '23 Adeniran Ogunsanya, Surulere',
  '56 Bourdillon Road, Ikoyi',
  '31 Kaduna Street, Maitama',
  '12 Wuse 2, Abuja',
  '45 Trans Amadi, Port Harcourt',
  '89 Ring Road, Ibadan',
  '34 Bompai Road, Kano',
];

const staffFirstNames = [
  'Adaobi', 'Chinedu', 'Folake', 'Oluwaseun', 'Ngozi',
  'Emeka', 'Amina', 'Tunde', 'Chisom', 'Ifeanyi',
];

const staffLastNames = [
  'Okonkwo', 'Okafor', 'Adeyemi', 'Eze', 'Balogun',
  'Ibrahim', 'Oyelaran', 'Nwosu', 'Adewale', 'Musah',
];

const categories = ['hair-services', 'nail-services', 'spa-treatments', 'barbering', 'skincare'];
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'kinky_hair_stylist',
});

async function seed() {
  await AppDataSource.initialize();
  console.log('Database connected');

  const hashedPassword = await bcrypt.hash('password123', 10);
  const nameList = businessNames.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');

  console.log('Cleaning up any prior run of this seed...');
  try {
    await AppDataSource.query(
      `DELETE FROM booking_days WHERE "businessId" IN (SELECT id FROM businesses WHERE "businessName" IN (${nameList}))`,
    );
  } catch (e) {}
  try {
    await AppDataSource.query(
      `DELETE FROM businesses WHERE "businessName" IN (${nameList})`,
    );
  } catch (e) {}
  try {
    await AppDataSource.query(
      `DELETE FROM "user" WHERE email LIKE 'commonowner%@khs-common.local'`,
    );
  } catch (e) {}

  for (let i = 0; i < businessNames.length; i++) {
    const cityIndex = i % cities.length;
    const addressIndex = i % addresses.length;

    const userResult = await AppDataSource.query(
      `INSERT INTO "user" (
        email, password, "firstName", surname, "phoneNumber",
        "isVerified", "isClient", "isBusiness", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING id`,
      [
        `commonowner${i + 1}@khs-common.local`,
        hashedPassword,
        staffFirstNames[i % staffFirstNames.length],
        staffLastNames[i % staffLastNames.length],
        `+23482${String(i).padStart(8, '0')}`,
        true,
        true,
        true,
      ],
    );
    const ownerId = userResult[0].id;

    // Rating deliberately kept in the 3.5-4.4 band — real variety, but
    // always below the 4.5 luxury auto-qualify threshold.
    const rating = +(3.5 + Math.random() * 0.9).toFixed(1);

    const businessResult = await AppDataSource.query(
      `INSERT INTO businesses (
        "businessName", description, "owner_id", "ownerName", "ownerEmail", "ownerPhone",
        "primaryAudience", "businessAddress", "businessImage", longitude, latitude,
        "companySize", status, category, plan, performance, revenue, bookings, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 0, 0, NOW(), NOW()) RETURNING id`,
      [
        businessNames[i],
        `Welcome to ${businessNames[i]}! We offer quality beauty and grooming services in ${cities[cityIndex].name}.`,
        ownerId,
        `${staffFirstNames[i % staffFirstNames.length]} ${staffLastNames[i % staffLastNames.length]}`,
        `commonowner${i + 1}@khs-common.local`,
        `+23482${String(i).padStart(8, '0')}`,
        'Everyone looking for quality beauty services',
        `${addresses[addressIndex]}, ${cities[cityIndex].name}`,
        JSON.stringify([
          businessImages[i % businessImages.length],
          businessImages[(i + 1) % businessImages.length],
        ]),
        cities[cityIndex].coords.lng + (Math.random() * 0.1 - 0.05),
        cities[cityIndex].coords.lat + (Math.random() * 0.1 - 0.05),
        'small-team',
        'approved',
        JSON.stringify([categories[i % categories.length], categories[(i + 1) % categories.length]]),
        'Free',
        JSON.stringify({
          rating,
          reviews: Math.floor(5 + Math.random() * 60),
          completionRate: +(80 + Math.random() * 15).toFixed(0),
          avgResponseMins: Math.floor(15 + Math.random() * 60),
        }),
      ],
    );
    const businessId = businessResult[0].id;

    for (const day of days) {
      await AppDataSource.query(
        `INSERT INTO booking_days (day, "isOpen", "startTime", "endTime", "businessId") VALUES ($1, $2, $3, $4, $5)`,
        [day, day !== 'Sunday', day === 'Saturday' ? '10:00' : '09:00', day === 'Saturday' ? '18:00' : '19:00', businessId],
      );
    }

    console.log(`Created common salon ${i + 1}: ${businessNames[i]} (rating ${rating})`);
  }

  console.log('\n=== Seeding Complete ===');
  console.log('Created 10 common (non-luxury) salons, all APPROVED.');

  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
