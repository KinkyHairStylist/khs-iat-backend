import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

// Sample image URLs (using placeholder images)
const businessImages = [
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
  'https://images.unsplash.com/photo-1633681926022-84c23e8cb2d6?w=800',
  'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800',
  'https://images.unsplash.com/photo-1600948836101-f9ffda59d250?w=800',
];

const staffAvatars = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
];

const serviceImages = [
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600',
  'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600',
  'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=600',
  'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=600',
  'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=600',
];

const businessNames = [
  'Kinky Curls Studio',
  'Natural Hair Haven',
  'Afro Beauty Lounge',
  'Locs & Twists Salon',
  'Braids & Beyond',
  'Natural Roots Studio',
  'Curl Care Center',
  'Textured Hair Studio',
  'Natural Beauty Bar',
  'Kinky Hair Boutique',
];

const cities = [
  { name: 'Lagos', coords: { lat: 6.5244, lng: 3.3792 } },
  { name: 'Abuja', coords: { lat: 9.0765, lng: 7.4983 } },
  { name: 'Port Harcourt', coords: { lat: 4.8156, lng: 7.0498 } },
  { name: 'Ibadan', coords: { lat: 7.3775, lng: 3.9470 } },
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
  'Zainab', 'Obinna', 'Fatima', 'Kunle', 'Amara',
  'Uche', 'Aisha', 'Chidi', 'Blessing', 'Yusuf',
];

const staffLastNames = [
  'Okonkwo', 'Okafor', 'Adeyemi', 'Eze', 'Balogun',
  'Ibrahim', 'Oyelaran', 'Nwosu', 'Adewale', 'Musah',
  'Chukwu', 'Adeleke', 'Ogunleye', 'Nnamdi', 'Salihu',
];

const staffRoles = [
  'HAIRSTYLIST', 'BARBER', 'NAIL_TECH', 'SPA_THERAPIST', 'MANAGER',
];

const serviceTypes = [
  'women-haircut', 'men-haircut', 'hair-coloring', 'hair-treatment', 'braiding',
  'manicure', 'pedicure', 'facial', 'massage', 'beard-trim',
];

const categories = [
  'hair-services', 'nail-services', 'spa-treatments', 'barbering', 'skincare',
];

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Create DataSource with direct connection
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'khs',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function seed() {
  await AppDataSource.initialize();
  console.log('Database connected');

  // Hash password for all users (password123)
  const hashedPassword = await bcrypt.hash('password123', 10);
  console.log('Password hashed');


  // Create 10 businesses
  for (let i = 0; i < 10; i++) {
    const cityIndex = i % cities.length;
    const addressIndex = i % addresses.length;

    // Create owner user with password and verified
    const userResult = await AppDataSource.query(
      `INSERT INTO "user" (
        email, password, "firstName", surname, "phoneNumber", 
        "isVerified", "isClient", "isBusiness", "avatarUrl", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING id`,
      [
        `owner${i + 1}@business${i + 1}.com`,
        hashedPassword,
        staffFirstNames[i % staffFirstNames.length],
        staffLastNames[i % staffLastNames.length],
        `+23480${String(i).padStart(8, '0')}`,
        true,
        true,
        true,
        staffAvatars[i % staffAvatars.length],
      ]
    );
    const ownerId = userResult[0].id;

    // Create business
    const businessResult = await AppDataSource.query(
      `INSERT INTO businesses (
        "businessName", description, "owner_id", "ownerName", "ownerEmail", "ownerPhone",
        "primaryAudience", "businessAddress", "businessImage", longitude, latitude,
        "companySize", status, category, plan, performance, revenue, bookings, "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 0, 0, NOW(), NOW()) RETURNING id`,
      [
        businessNames[i],
        `Welcome to ${businessNames[i]}! We specialize in kinky and natural hair care services in ${cities[cityIndex].name}. Our expert stylists are dedicated to helping you embrace your natural beauty.`,
        ownerId,
        `${staffFirstNames[i % staffFirstNames.length]} ${staffLastNames[i % staffLastNames.length]}`,
        `owner${i + 1}@business${i + 1}.com`,
        `+23480${String(i).padStart(8, '0')}`,
        'Natural hair enthusiasts and beauty lovers',
        `${addresses[addressIndex]}, ${cities[cityIndex].name}`,
        JSON.stringify([
          businessImages[i % businessImages.length],
          businessImages[(i + 1) % businessImages.length],
          businessImages[(i + 2) % businessImages.length],
        ]),
        cities[cityIndex].coords.lng + (Math.random() * 0.1 - 0.05),
        cities[cityIndex].coords.lat + (Math.random() * 0.1 - 0.05),
        'small-team',
        'approved',
        JSON.stringify([categories[i % categories.length], categories[(i + 1) % categories.length]]),
        'Free',
        JSON.stringify({
          rating: +(4.0 + Math.random() * 1.0).toFixed(1),
          reviews: Math.floor(50 + Math.random() * 200),
          completionRate: +(90 + Math.random() * 10).toFixed(0),
          avgResponseMins: Math.floor(10 + Math.random() * 30),
        }),
      ]
    );
    const businessId = businessResult[0].id;

    // Create booking hours for the business
    for (const day of days) {
      await AppDataSource.query(
        `INSERT INTO booking_days (day, "isOpen", "startTime", "endTime", "businessId") VALUES ($1, $2, $3, $4, $5)`,
        [
          day,
          day !== 'Sunday',
          day === 'Saturday' ? '10:00' : '09:00',
          day === 'Saturday' ? '18:00' : '19:00',
          businessId,
        ]
      );
    }

    // Create 5 staff members for each business
    for (let j = 0; j < 5; j++) {
      await AppDataSource.query(
        `INSERT INTO staff (
          "firstName", "lastName", email, "phoneNumber", gender, "jobTitle", 
          role, specialization, avatar, "experienceYears", "isActive", 
          "employmentType", "startDate", "business_id"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          staffFirstNames[(i + j) % staffFirstNames.length],
          staffLastNames[(i + j + 1) % staffLastNames.length],
          `staff${i + 1}_${j + 1}@business${i + 1}.com`,
          `+23481${String(i * 5 + j).padStart(8, '0')}`,
          j % 2 === 0 ? 'MALE' : 'FEMALE',
          staffRoles[j % staffRoles.length].replace('_', ' '),
          staffRoles[j % staffRoles.length],
          categories[i % categories.length].replace('-', ' '),
          staffAvatars[(i + j) % staffAvatars.length],
          2 + Math.floor(Math.random() * 10),
          true,
          'Full-time',
          new Date(Date.now() - Math.random() * 5 * 365 * 24 * 60 * 60 * 1000),
          businessId,
        ]
      );
    }

    // Create 10 services for each business
    for (let k = 0; k < 10; k++) {
      const serviceType = serviceTypes[k % serviceTypes.length];
      const category = categories[k % categories.length];

      // PostgreSQL array format for text[] - need to quote each element
      const img1 = serviceImages[(i + k) % serviceImages.length];
      const img2 = serviceImages[(i + k + 1) % serviceImages.length];
      const imagesArray = `{"${img1}","${img2}"}`;

      await AppDataSource.query(
        `INSERT INTO "Service" (
          name, description, price, duration, category, "serviceType", images, "businessId", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          serviceType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          `Professional ${serviceType.replace(/-/g, ' ')} service at ${businessNames[i]}. Our experienced stylists ensure you get the best results.`,
          5000 + Math.floor(Math.random() * 20000),
          `${30 + Math.floor(Math.random() * 90)} mins`,
          category,
          serviceType,
          imagesArray,
          businessId,
        ]
      );
    }

    console.log(`Created business ${i + 1}: ${businessNames[i]}`);
  }

  console.log('\n=== Seeding Complete ===');
  console.log('Created:');
  console.log('- 10 Business Owners (all verified with password: password123)');
  console.log('- 10 Businesses (all APPROVED)');
  console.log('- 50 Staff Members (5 per business)');
  console.log('- 100 Services (10 per business)');
  console.log('- 70 Booking Days (7 per business)');
  console.log('\nOwner login credentials: ownerX@businessX.com / password123');

  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});