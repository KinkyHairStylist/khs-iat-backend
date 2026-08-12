import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

// International (non-Nigerian) salons — mix of luxury and non-luxury —
// each with real bookable Service rows attached. The earlier
// seed-global-salons.ts created businesses only, no services, which is
// why location coverage looked fine on the salons grid but empty on
// anything that lists services (booking flow, service search). This
// script seeds both together so a business seeded here is immediately
// bookable, not just visible.

const businessImages = [
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
  'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=800',
  'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800',
  'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=800',
];

const categories = ['hair-services', 'nail-services', 'spa-treatments', 'barbering', 'skincare', 'makeup-services', 'lashes-brows', 'body-care'];
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// category -> service types that belong to it (mirrors service-type.enum.ts)
const servicesByCategory: Record<string, { type: string; name: string }[]> = {
  'hair-services': [
    { type: 'women-haircut', name: "Women's Haircut & Style" },
    { type: 'men-haircut', name: "Men's Haircut" },
    { type: 'hair-coloring', name: 'Full Hair Coloring' },
    { type: 'hair-treatment', name: 'Deep Conditioning Treatment' },
    { type: 'blow-dry', name: 'Blow Dry & Finish' },
    { type: 'braiding', name: 'Protective Braiding' },
  ],
  'nail-services': [
    { type: 'manicure', name: 'Classic Manicure' },
    { type: 'pedicure', name: 'Spa Pedicure' },
    { type: 'gel-polish', name: 'Gel Polish' },
    { type: 'acrylic-nails', name: 'Acrylic Nail Extensions' },
  ],
  'makeup-services': [
    { type: 'bridal-makeup', name: 'Bridal Makeup' },
    { type: 'party-makeup', name: 'Party Glam Makeup' },
    { type: 'natural-glam', name: 'Natural Everyday Glam' },
  ],
  'spa-treatments': [
    { type: 'facial', name: 'Rejuvenating Facial' },
    { type: 'body-scrub', name: 'Exfoliating Body Scrub' },
    { type: 'massage', name: 'Relaxation Massage' },
  ],
  barbering: [
    { type: 'men-haircut', name: "Men's Signature Cut" },
    { type: 'beard-trim', name: 'Beard Trim & Shape' },
    { type: 'fade-cut', name: 'Skin Fade' },
  ],
  skincare: [
    { type: 'deep-cleansing-facial', name: 'Deep Cleansing Facial' },
    { type: 'acne-treatment', name: 'Acne Treatment' },
  ],
  'lashes-brows': [
    { type: 'lash-extension', name: 'Lash Extensions' },
    { type: 'brow-shaping', name: 'Brow Shaping' },
    { type: 'brow-tint', name: 'Brow Tint' },
  ],
  'body-care': [
    { type: 'waxing', name: 'Full Body Waxing' },
    { type: 'body-polish', name: 'Body Polish' },
  ],
};

interface CityDef {
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
}

const AU: CityDef[] = [
  { city: 'Sydney', state: 'NSW', country: 'Australia', lat: -33.8688, lng: 151.2093 },
  { city: 'Melbourne', state: 'VIC', country: 'Australia', lat: -37.8136, lng: 144.9631 },
  { city: 'Brisbane', state: 'QLD', country: 'Australia', lat: -27.4698, lng: 153.0251 },
  { city: 'Perth', state: 'WA', country: 'Australia', lat: -31.9505, lng: 115.8605 },
];

const US: CityDef[] = [
  { city: 'New York', state: 'NY', country: 'USA', lat: 40.7128, lng: -74.006 },
  { city: 'Los Angeles', state: 'CA', country: 'USA', lat: 34.0522, lng: -118.2437 },
  { city: 'Houston', state: 'TX', country: 'USA', lat: 29.7604, lng: -95.3698 },
  { city: 'Miami', state: 'FL', country: 'USA', lat: 25.7617, lng: -80.1918 },
  { city: 'Chicago', state: 'IL', country: 'USA', lat: 41.8781, lng: -87.6298 },
];

const UK: CityDef[] = [
  { city: 'London', state: 'England', country: 'UK', lat: 51.5072, lng: -0.1276 },
  { city: 'Manchester', state: 'England', country: 'UK', lat: 53.4808, lng: -2.2426 },
  { city: 'Edinburgh', state: 'Scotland', country: 'UK', lat: 55.9533, lng: -3.1883 },
  { city: 'Cardiff', state: 'Wales', country: 'UK', lat: 51.4816, lng: -3.1791 },
];

const CA: CityDef[] = [
  { city: 'Toronto', state: 'ON', country: 'Canada', lat: 43.6532, lng: -79.3832 },
  { city: 'Vancouver', state: 'BC', country: 'Canada', lat: 49.2827, lng: -123.1207 },
  { city: 'Montreal', state: 'QC', country: 'Canada', lat: 45.5019, lng: -73.5674 },
];

const AE: CityDef[] = [
  { city: 'Dubai', state: 'Dubai', country: 'UAE', lat: 25.2048, lng: 55.2708 },
  { city: 'Abu Dhabi', state: 'Abu Dhabi', country: 'UAE', lat: 24.4539, lng: 54.3773 },
];

const ZA: CityDef[] = [
  { city: 'Johannesburg', state: 'Gauteng', country: 'South Africa', lat: -26.2041, lng: 28.0473 },
  { city: 'Cape Town', state: 'Western Cape', country: 'South Africa', lat: -33.9249, lng: 18.4241 },
];

// 4 per group, 6 groups = 24 businesses. Half will roll >=4.5 (luxury),
// half below, via the rating distribution below — deliberate, not random
// chance, so we always get a real mix regardless of Math.random() luck.
const cityGroups: { cities: CityDef[]; count: number }[] = [
  { cities: AU, count: 4 },
  { cities: US, count: 4 },
  { cities: UK, count: 4 },
  { cities: CA, count: 4 },
  { cities: AE, count: 4 },
  { cities: ZA, count: 4 },
];

const nameTemplates = [
  'Radiant Hair Studio', 'The Braid House', 'Curl & Co.', 'Silk Strands Salon',
  'Golden Comb Barbershop', 'Velvet Roots', 'The Glow Parlour', 'Twist & Shine',
  'Crown Beauty Bar', 'Mane Attraction', 'The Loc Lounge', 'Polished Beauty Studio',
  'Coco Curls', 'Sunset Salon & Spa', 'Elevate Hair Co.', 'The Style Foundry',
  'Bare Beauty Bar', 'Prime Cuts Barbershop', 'Halo Hair Studio', 'The Vanity Room',
  'Muse Salon', 'Onyx Hair Lounge', 'Radiance Beauty Studio', 'The Grooming Room',
];

const staffFirstNames = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Sam', 'Jamie', 'Drew', 'Skyler'];
const staffLastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Clark'];

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'kinky_hair_stylist',
  ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false,
});

function randomPrice(min: number, max: number): number {
  return +(min + Math.random() * (max - min)).toFixed(2);
}

async function seed() {
  await AppDataSource.initialize();
  console.log(`Database connected: ${process.env.DB_HOST}/${process.env.DB_DATABASE}`);

  const hashedPassword = await bcrypt.hash('password123', 10);
  const nameList = nameTemplates.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');

  console.log('Cleaning up any prior run of this seed...');
  try {
    await AppDataSource.query(
      `DELETE FROM "Service" WHERE "businessId" IN (SELECT id FROM businesses WHERE "businessName" IN (${nameList}) AND "ownerEmail" LIKE '%@khs-global2.local')`,
    );
  } catch (e) {}
  try {
    await AppDataSource.query(
      `DELETE FROM booking_days WHERE "businessId" IN (SELECT id FROM businesses WHERE "businessName" IN (${nameList}) AND "ownerEmail" LIKE '%@khs-global2.local')`,
    );
  } catch (e) {}
  try {
    await AppDataSource.query(
      `DELETE FROM businesses WHERE "businessName" IN (${nameList}) AND "ownerEmail" LIKE '%@khs-global2.local'`,
    );
  } catch (e) {}
  try {
    await AppDataSource.query(`DELETE FROM "user" WHERE email LIKE 'globalowner2_%@khs-global2.local'`);
  } catch (e) {}

  let nameIdx = 0;
  let created = 0;
  let servicesCreated = 0;

  for (const group of cityGroups) {
    for (let i = 0; i < group.count; i++) {
      const city = group.cities[i % group.cities.length];
      const name = nameTemplates[nameIdx % nameTemplates.length];
      nameIdx++;

      const userResult = await AppDataSource.query(
        `INSERT INTO "user" (
          email, password, "firstName", surname, "phoneNumber",
          "isVerified", "isMerchant", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING id`,
        [
          `globalowner2_${created + 1}@khs-global2.local`,
          hashedPassword,
          staffFirstNames[created % staffFirstNames.length],
          staffLastNames[created % staffLastNames.length],
          `+1${String(2000000000 + created).padStart(10, '0')}`,
          true,
          true,
        ],
      );
      const ownerId = userResult[0].id;

      // Deliberate split: even index in the group -> luxury (>=4.5),
      // odd index -> non-luxury (3.5-4.4). Not left to Math.random() luck.
      const isLuxuryRow = i % 2 === 0;
      const rating = isLuxuryRow
        ? +(4.5 + Math.random() * 0.5).toFixed(1)
        : +(3.5 + Math.random() * 0.9).toFixed(1);

      const catA = categories[created % categories.length];
      const catB = categories[(created + 3) % categories.length];

      const businessResult = await AppDataSource.query(
        `INSERT INTO businesses (
          "businessName", description, "owner_id", "ownerName", "ownerEmail", "ownerPhone",
          "primaryAudience", "businessAddress", "businessImage", longitude, latitude,
          "companySize", status, category, plan, performance, revenue, bookings, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 0, 0, NOW(), NOW()) RETURNING id`,
        [
          name,
          `Welcome to ${name}! We offer premium beauty and grooming services in ${city.city}, ${city.state}.`,
          ownerId,
          `${staffFirstNames[created % staffFirstNames.length]} ${staffLastNames[created % staffLastNames.length]}`,
          `globalowner2_${created + 1}@khs-global2.local`,
          `+1${String(2000000000 + created).padStart(10, '0')}`,
          'Everyone looking for quality beauty services',
          `${100 + created} High Street, ${city.state}, ${city.city}`,
          JSON.stringify([
            businessImages[created % businessImages.length],
            businessImages[(created + 1) % businessImages.length],
          ]),
          city.lng + (Math.random() * 0.05 - 0.025),
          city.lat + (Math.random() * 0.05 - 0.025),
          'small-team',
          'approved',
          JSON.stringify([catA, catB]),
          'Free',
          JSON.stringify({
            rating,
            reviews: Math.floor(10 + Math.random() * 150),
            completionRate: +(85 + Math.random() * 15).toFixed(0),
            avgResponseMins: Math.floor(10 + Math.random() * 50),
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

      // 2-3 services per business, drawn from each of its 2 categories.
      const servicePool = [
        ...(servicesByCategory[catA] ?? []).map((s) => ({ ...s, category: catA })),
        ...(servicesByCategory[catB] ?? []).map((s) => ({ ...s, category: catB })),
      ];
      const serviceCount = Math.min(servicePool.length, 2 + (created % 2));
      for (let s = 0; s < serviceCount; s++) {
        const svc = servicePool[s];
        const price = Math.round(isLuxuryRow ? randomPrice(80, 250) : randomPrice(20, 90));
        await AppDataSource.query(
          `INSERT INTO "Service" (
            name, category, "serviceType", description, "priceType", price, duration, images, "businessId", "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, 'fixed', $5, $6, $7, $8, NOW(), NOW())`,
          [
            svc.name,
            svc.category,
            svc.type,
            `${svc.name} at ${name}, ${city.city}.`,
            price,
            `${30 + (s % 3) * 15} mins`,
            [businessImages[(created + s) % businessImages.length]],
            businessId,
          ],
        );
        servicesCreated++;
      }

      created++;
      console.log(
        `Created ${created}: ${name} — ${city.city}, ${city.state}, ${city.country} (rating ${rating}, ${isLuxuryRow ? 'LUXURY' : 'regular'}, ${serviceCount} services)`,
      );
    }
  }

  console.log('\n=== Seeding Complete ===');
  console.log(`Created ${created} international salons (mix of luxury + non-luxury) across ${cityGroups.length} countries, all APPROVED.`);
  console.log(`Created ${servicesCreated} bookable services across those salons.`);

  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
