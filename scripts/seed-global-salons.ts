import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

// 50 international salons across 6 countries, spread over real
// states/provinces/regions within each — KHS is a global platform and the
// seed data was entirely Nigeria-only until now, which is why the location
// filter only ever showed Nigerian cities. Addresses end in the CITY name
// (matching the existing seed convention — getLocations() takes the last
// comma-separated segment as the filterable location).

const businessImages = [
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
  'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=800',
  'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800',
  'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=800',
];

const categories = ['hair-services', 'nail-services', 'spa-treatments', 'barbering', 'skincare'];
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface CityDef {
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
}

// 10 per country/region group below, 6 groups = 60 city slots available;
// we only use the first N per group as specified (AU 10, US 10, UK 8,
// CA 8, UAE 6, ZA 8 = 50 total) — extra city defs beyond that per group
// are simply unused, kept here for readability/spread within the group.
const AU: CityDef[] = [
  { city: 'Sydney', state: 'NSW', country: 'Australia', lat: -33.8688, lng: 151.2093 },
  { city: 'Newcastle', state: 'NSW', country: 'Australia', lat: -32.9283, lng: 151.7817 },
  { city: 'Melbourne', state: 'VIC', country: 'Australia', lat: -37.8136, lng: 144.9631 },
  { city: 'Geelong', state: 'VIC', country: 'Australia', lat: -38.1499, lng: 144.3617 },
  { city: 'Brisbane', state: 'QLD', country: 'Australia', lat: -27.4698, lng: 153.0251 },
  { city: 'Gold Coast', state: 'QLD', country: 'Australia', lat: -28.0167, lng: 153.4 },
  { city: 'Perth', state: 'WA', country: 'Australia', lat: -31.9505, lng: 115.8605 },
  { city: 'Fremantle', state: 'WA', country: 'Australia', lat: -32.0569, lng: 115.7439 },
  { city: 'Adelaide', state: 'SA', country: 'Australia', lat: -34.9285, lng: 138.6007 },
  { city: 'Canberra', state: 'ACT', country: 'Australia', lat: -35.2809, lng: 149.13 },
];

const US: CityDef[] = [
  { city: 'New York', state: 'NY', country: 'USA', lat: 40.7128, lng: -74.006 },
  { city: 'Buffalo', state: 'NY', country: 'USA', lat: 42.8864, lng: -78.8784 },
  { city: 'Los Angeles', state: 'CA', country: 'USA', lat: 34.0522, lng: -118.2437 },
  { city: 'San Francisco', state: 'CA', country: 'USA', lat: 37.7749, lng: -122.4194 },
  { city: 'Houston', state: 'TX', country: 'USA', lat: 29.7604, lng: -95.3698 },
  { city: 'Austin', state: 'TX', country: 'USA', lat: 30.2672, lng: -97.7431 },
  { city: 'Miami', state: 'FL', country: 'USA', lat: 25.7617, lng: -80.1918 },
  { city: 'Orlando', state: 'FL', country: 'USA', lat: 28.5383, lng: -81.3792 },
  { city: 'Atlanta', state: 'GA', country: 'USA', lat: 33.749, lng: -84.388 },
  { city: 'Chicago', state: 'IL', country: 'USA', lat: 41.8781, lng: -87.6298 },
];

const UK: CityDef[] = [
  { city: 'London', state: 'England', country: 'UK', lat: 51.5072, lng: -0.1276 },
  { city: 'Manchester', state: 'England', country: 'UK', lat: 53.4808, lng: -2.2426 },
  { city: 'Birmingham', state: 'England', country: 'UK', lat: 52.4862, lng: -1.8904 },
  { city: 'Leeds', state: 'England', country: 'UK', lat: 53.8008, lng: -1.5491 },
  { city: 'Bristol', state: 'England', country: 'UK', lat: 51.4545, lng: -2.5879 },
  { city: 'Edinburgh', state: 'Scotland', country: 'UK', lat: 55.9533, lng: -3.1883 },
  { city: 'Glasgow', state: 'Scotland', country: 'UK', lat: 55.8642, lng: -4.2518 },
  { city: 'Cardiff', state: 'Wales', country: 'UK', lat: 51.4816, lng: -3.1791 },
];

const CA: CityDef[] = [
  { city: 'Toronto', state: 'ON', country: 'Canada', lat: 43.6532, lng: -79.3832 },
  { city: 'Ottawa', state: 'ON', country: 'Canada', lat: 45.4215, lng: -75.6972 },
  { city: 'Vancouver', state: 'BC', country: 'Canada', lat: 49.2827, lng: -123.1207 },
  { city: 'Victoria', state: 'BC', country: 'Canada', lat: 48.4284, lng: -123.3656 },
  { city: 'Montreal', state: 'QC', country: 'Canada', lat: 45.5019, lng: -73.5674 },
  { city: 'Quebec City', state: 'QC', country: 'Canada', lat: 46.8139, lng: -71.208 },
  { city: 'Calgary', state: 'AB', country: 'Canada', lat: 51.0447, lng: -114.0719 },
  { city: 'Edmonton', state: 'AB', country: 'Canada', lat: 53.5461, lng: -113.4938 },
];

const AE: CityDef[] = [
  { city: 'Dubai', state: 'Dubai', country: 'UAE', lat: 25.2048, lng: 55.2708 },
  { city: 'Abu Dhabi', state: 'Abu Dhabi', country: 'UAE', lat: 24.4539, lng: 54.3773 },
  { city: 'Sharjah', state: 'Sharjah', country: 'UAE', lat: 25.3463, lng: 55.4209 },
  { city: 'Al Ain', state: 'Abu Dhabi', country: 'UAE', lat: 24.2075, lng: 55.7447 },
  { city: 'Ajman', state: 'Ajman', country: 'UAE', lat: 25.4052, lng: 55.5136 },
  { city: 'Ras Al Khaimah', state: 'RAK', country: 'UAE', lat: 25.7895, lng: 55.9432 },
];

const ZA: CityDef[] = [
  { city: 'Johannesburg', state: 'Gauteng', country: 'South Africa', lat: -26.2041, lng: 28.0473 },
  { city: 'Pretoria', state: 'Gauteng', country: 'South Africa', lat: -25.7479, lng: 28.2293 },
  { city: 'Cape Town', state: 'Western Cape', country: 'South Africa', lat: -33.9249, lng: 18.4241 },
  { city: 'Stellenbosch', state: 'Western Cape', country: 'South Africa', lat: -33.9321, lng: 18.8602 },
  { city: 'Durban', state: 'KwaZulu-Natal', country: 'South Africa', lat: -29.8587, lng: 31.0218 },
  { city: 'Pietermaritzburg', state: 'KwaZulu-Natal', country: 'South Africa', lat: -29.6006, lng: 30.3794 },
  { city: 'Port Elizabeth', state: 'Eastern Cape', country: 'South Africa', lat: -33.9608, lng: 25.6022 },
  { city: 'Bloemfontein', state: 'Free State', country: 'South Africa', lat: -29.0852, lng: 26.1596 },
];

// Scaled down from the original 50 (10/10/8/8/6/8) to 18 total — the
// larger batch, combined with a since-fixed N+1 query bug, made the salon
// pages noticeably slow/unresponsive. Kept the same real state/city
// variety per country, just fewer businesses per group.
const cityGroups: { cities: CityDef[]; count: number }[] = [
  { cities: AU, count: 3 },
  { cities: US, count: 3 },
  { cities: UK, count: 3 },
  { cities: CA, count: 3 },
  { cities: AE, count: 3 },
  { cities: ZA, count: 3 },
];

const nameTemplates = [
  'Radiant Hair Studio', 'The Braid House', 'Curl & Co.', 'Silk Strands Salon',
  'Golden Comb Barbershop', 'Velvet Roots', 'The Glow Parlour', 'Twist & Shine',
  'Crown Beauty Bar', 'Mane Attraction', 'The Loc Lounge', 'Polished Beauty Studio',
  'Coco Curls', 'Sunset Salon & Spa', 'Elevate Hair Co.', 'The Style Foundry',
  'Bare Beauty Bar', 'Prime Cuts Barbershop', 'Halo Hair Studio', 'The Vanity Room',
  'Muse Salon', 'Onyx Hair Lounge', 'Radiance Beauty Studio', 'The Grooming Room',
  'Aura Hair & Nails', 'Bloom & Blade', 'Kindred Beauty Co.', 'The Finishing Touch',
  'Lush Locs Studio', 'Amber Beauty Bar', 'Nova Hair Studio', 'The Refined Edge',
  'Willow Beauty Lounge', 'Ember & Co. Salon', 'Sage Beauty Studio', 'The Hair Atelier',
  'Bliss Beauty Bar', 'Origin Barbershop', 'Flawless Beauty Studio', 'The Cut Above',
  'Studio Noir', 'Rosewood Salon', 'Prestige Hair Studio', 'The Beauty Vault',
  'Zenith Salon & Spa', 'Coastal Beauty Bar', 'Heritage Hair Studio', 'The Glow Room',
  'Marble & Mane', 'Ivy Beauty Lounge',
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
});

async function seed() {
  await AppDataSource.initialize();
  console.log('Database connected');

  const hashedPassword = await bcrypt.hash('password123', 10);
  const nameList = nameTemplates.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');

  console.log('Cleaning up any prior run of this seed...');
  try {
    await AppDataSource.query(
      `DELETE FROM booking_days WHERE "businessId" IN (SELECT id FROM businesses WHERE "businessName" IN (${nameList}))`,
    );
  } catch (e) {}
  try {
    await AppDataSource.query(`DELETE FROM businesses WHERE "businessName" IN (${nameList})`);
  } catch (e) {}
  try {
    await AppDataSource.query(`DELETE FROM "user" WHERE email LIKE 'globalowner%@khs-global.local'`);
  } catch (e) {}

  let nameIdx = 0;
  let created = 0;

  for (const group of cityGroups) {
    for (let i = 0; i < group.count; i++) {
      const city = group.cities[i % group.cities.length];
      const name = nameTemplates[nameIdx % nameTemplates.length];
      nameIdx++;

      const userResult = await AppDataSource.query(
        `INSERT INTO "user" (
          email, password, "firstName", surname, "phoneNumber",
          "isVerified", "isClient", "isBusiness", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) RETURNING id`,
        [
          `globalowner${created + 1}@khs-global.local`,
          hashedPassword,
          staffFirstNames[created % staffFirstNames.length],
          staffLastNames[created % staffLastNames.length],
          `+1${String(1000000000 + created).padStart(10, '0')}`,
          true,
          true,
          true,
        ],
      );
      const ownerId = userResult[0].id;

      const rating = +(3.6 + Math.random() * 1.4).toFixed(1); // 3.6 - 5.0, real spread including some 4.5+ (auto-luxury)

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
          `globalowner${created + 1}@khs-global.local`,
          `+1${String(1000000000 + created).padStart(10, '0')}`,
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
          JSON.stringify([categories[created % categories.length], categories[(created + 1) % categories.length]]),
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

      created++;
      console.log(`Created ${created}/50: ${name} — ${city.city}, ${city.state}, ${city.country} (rating ${rating})`);
    }
  }

  console.log('\n=== Seeding Complete ===');
  console.log(`Created ${created} international salons across ${cityGroups.length} countries, all APPROVED.`);

  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
