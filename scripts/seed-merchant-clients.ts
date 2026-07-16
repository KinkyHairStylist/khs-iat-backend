import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

const MERCHANT_EMAIL = 'prospectkhs14@yopmail.com';
const CLIENT_PASSWORD = 'TestPassword123!';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'khs',
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

const CLIENTS = [
  { firstName: 'Amara', surname: 'Okafor', email: 'client-khs1@yopmail.com', phone: '+2348011111111', gender: 'FEMALE', dob: '1995-04-12', clientType: 'vip', source: 'referral', city: 'Lagos', state: 'Lagos' },
  { firstName: 'Chioma', surname: 'Eze', email: 'client2@test.com', phone: '+2348022222222', gender: 'FEMALE', dob: '1998-07-22', clientType: 'regular', source: 'instagram', city: 'Abuja', state: 'FCT' },
  { firstName: 'Tunde', surname: 'Bello', email: 'client3@test.com', phone: '+2348033333333', gender: 'MALE', dob: '1992-11-05', clientType: 'regular', source: 'website', city: 'Lagos', state: 'Lagos' },
  { firstName: 'Zainab', surname: 'Abubakar', email: 'client4@test.com', phone: '+2348044444444', gender: 'FEMALE', dob: '2000-01-30', clientType: 'new', source: 'facebook', city: 'Kano', state: 'Kano' },
  { firstName: 'Folake', surname: 'Adebayo', email: 'client5@test.com', phone: '+2348055555555', gender: 'FEMALE', dob: '1993-09-15', clientType: 'vip', source: 'referral', city: 'Ibadan', state: 'Oyo' },
  { firstName: 'Emeka', surname: 'Nwosu', email: 'client6@test.com', phone: '+2348066666666', gender: 'MALE', dob: '1997-03-08', clientType: 'regular', source: 'walk-in', city: 'Port Harcourt', state: 'Rivers' },
  { firstName: 'Ngozi', surname: 'Okonkwo', email: 'client-khs7@yopmail.com', phone: '+2348077777777', gender: 'FEMALE', dob: '1990-12-25', clientType: 'vip', source: 'referral', city: 'Enugu', state: 'Enugu' },
  { firstName: 'Dayo', surname: 'Ogunlade', email: 'client-khs8@yopmail.com', phone: '+2348088888888', gender: 'MALE', dob: '1989-06-18', clientType: 'regular', source: 'instagram', city: 'Lagos', state: 'Lagos' },
  { firstName: 'Blessing', surname: 'John', email: 'client-khs9@yopmail.com', phone: '+2348099999999', gender: 'FEMALE', dob: '2001-08-14', clientType: 'new', source: 'website', city: 'Calabar', state: 'Cross River' },
  { firstName: 'Kunle', surname: 'Afolabi', email: 'client10@test.com', phone: '+2348100000000', gender: 'MALE', dob: '1994-05-20', clientType: 'regular', source: 'walk-in', city: 'Abeokuta', state: 'Ogun' },
];

const SERVICES = [
  { name: 'Premium Haircut & Styling', category: 'hair-services', type: 'women-haircut', price: 15000, duration: '90 min' },
  { name: 'Luxury Braids Installation', category: 'hair-services', type: 'braiding', price: 35000, duration: '240 min' },
  { name: 'Hair Coloring & Highlights', category: 'hair-services', type: 'hair-coloring', price: 25000, duration: '120 min' },
  { name: 'Deep Conditioning Treatment', category: 'hair-services', type: 'hair-treatment', price: 12000, duration: '60 min' },
  { name: 'Classic Manicure & Pedicure', category: 'nail-services', type: 'manicure', price: 18000, duration: '75 min' },
  { name: 'Gel Nail Extension', category: 'nail-services', type: 'acrylic-nails', price: 22000, duration: '90 min' },
  { name: 'Bridal Makeup Package', category: 'makeup-services', type: 'bridal-makeup', price: 50000, duration: '120 min' },
  { name: 'Natural Glam Makeup', category: 'makeup-services', type: 'natural-glam', price: 20000, duration: '60 min' },
  { name: 'Luxury Facial Treatment', category: 'spa-treatments', type: 'facial', price: 25000, duration: '75 min' },
  { name: 'Full Body Massage', category: 'spa-treatments', type: 'massage', price: 30000, duration: '90 min' },
  { name: 'Lash Extension Set', category: 'lashes-brows', type: 'lash-extension', price: 20000, duration: '90 min' },
  { name: 'Brow Shaping & Tint', category: 'lashes-brows', type: 'brow-shaping', price: 8000, duration: '30 min' },
  { name: 'Skincare Consultation', category: 'skincare', type: 'deep-cleansing-facial', price: 15000, duration: '60 min' },
  { name: 'Acne Treatment Session', category: 'skincare', type: 'acne-treatment', price: 18000, duration: '60 min' },
  { name: 'Full Body Waxing', category: 'body-care', type: 'waxing', price: 25000, duration: '60 min' },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(1, daysAgo));
  return d.toISOString().split('T')[0];
}

function pastDateTime(daysAgo: number): { date: string; time: string } {
  const d = new Date();
  d.setDate(d.getDate() - randomInt(1, daysAgo));
  d.setHours(randomInt(9, 17), [0, 15, 30, 45][randomInt(0, 3)], 0, 0);
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date: d.toISOString().split('T')[0], time: timeStr };
}

async function seed() {
  await AppDataSource.initialize();
  console.log('Database connected');

  // 1. Find the merchant
  const [merchant] = await AppDataSource.query(
    `SELECT id FROM "user" WHERE email = $1`, [MERCHANT_EMAIL],
  );
  if (!merchant) {
    console.error(`Merchant not found: ${MERCHANT_EMAIL}`);
    await AppDataSource.destroy();
    process.exit(1);
  }
  console.log(`Found merchant: ${MERCHANT_EMAIL} (id: ${merchant.id})`);

  // 2. Find the merchant's business
  const [business] = await AppDataSource.query(
    `SELECT id, "businessName" FROM businesses WHERE "owner_id" = $1`, [merchant.id],
  );
  if (!business) {
    console.error('No business found for this merchant');
    await AppDataSource.destroy();
    process.exit(1);
  }
  console.log(`Found business: ${business.businessName} (id: ${business.id})`);

  // 3. Find or create wallet for the business
  let [wallet] = await AppDataSource.query(
    `SELECT id FROM business_wallets WHERE "businessId" = $1`, [business.id],
  );
  if (!wallet) {
    const result = await AppDataSource.query(
      `INSERT INTO business_wallets ("businessId", "ownerId", balance, "totalIncome", "totalExpenses", currency, status, "pendingBalance", "isVerified")
       VALUES ($1, $2, 0, 0, 0, 'NGN', 'active', 0, true) RETURNING id`,
      [business.id, merchant.id],
    );
    wallet = result[0];
    console.log('Created wallet for business');
  }

  // 4. Create services for the business
  const serviceIds: string[] = [];
  for (const svc of SERVICES) {
    const existing = await AppDataSource.query(
      `SELECT id FROM "Service" WHERE "name" = $1 AND "businessId" = $2`, [svc.name, business.id],
    );
    if (existing.length > 0) {
      serviceIds.push(existing[0].id);
    } else {
      const result = await AppDataSource.query(
        `INSERT INTO "Service" (name, category, "serviceType", description, price, duration, "businessId")
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [svc.name, svc.category, svc.type, `Professional ${svc.name.toLowerCase()} service`, svc.price, svc.duration, business.id],
      );
      serviceIds.push(result[0].id);
    }
  }
  console.log(`${serviceIds.length} services ready`);

  // 5. Create staff (stylists)
  const staffList = [
    { firstName: 'Grace', lastName: 'Okoro', email: 'grace.staff@test.com', role: 'HAIRSTYLIST' },
    { firstName: 'Femi', lastName: 'Adebayo', email: 'femi.staff@test.com', role: 'HAIRSTYLIST' },
    { firstName: 'Tola', lastName: 'Bamidele', email: 'tola.staff@test.com', role: 'MANAGER' },
  ];

  const staffIds: string[] = [];
  for (const s of staffList) {
    const existing = await AppDataSource.query(
      `SELECT id FROM staff WHERE email = $1 AND "business_id" = $2`, [s.email, business.id],
    );
    if (existing.length > 0) {
      staffIds.push(existing[0].id);
    } else {
      const result = await AppDataSource.query(
        `INSERT INTO staff ("firstName", "lastName", email, role, "business_id", "isActive")
         VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
        [s.firstName, s.lastName, s.email, s.role, business.id],
      );
      staffIds.push(result[0].id);
    }
  }
  console.log(`${staffIds.length} staff ready`);

  // Enable the hash outside the loop so we reuse it
  const hash = await bcrypt.hash(CLIENT_PASSWORD, await bcrypt.genSalt(10));
  let createdClients = 0;
  let createdAppointments = 0;
  let createdTransactions = 0;
  let createdReviews = 0;

  for (const c of CLIENTS) {
    // Check if user already exists
    let [existingUser] = await AppDataSource.query(
      `SELECT id FROM "user" WHERE email = $1`, [c.email],
    );
    if (existingUser) {
      console.log(`  Client user already exists: ${c.email}`);
    } else {
      const result = await AppDataSource.query(
        `INSERT INTO "user" (email, password, "firstName", surname, "phoneNumber", gender, "dateOfBirth", city, state, country, "isVerified", "isCustomer", "booking", "spent", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Nigeria', true, true, 0, 0, NOW(), NOW()) RETURNING id`,
        [c.email, hash, c.firstName, c.surname, c.phone, c.gender, c.dob, c.city, c.state],
      );
      existingUser = result[0];
      createdClients++;
    }

    // Check if ClientSchema entry exists for this merchant
    let [existingClientSchema] = await AppDataSource.query(
      `SELECT id FROM clients WHERE email = $1 AND "owner_id" = $2`, [c.email, merchant.id],
    );
    if (!existingClientSchema) {
      await AppDataSource.query(
        `INSERT INTO clients ("firstName", "lastName", email, phone, "clientType", "clientSource", gender, "dateOfBirth", "owner_id")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [c.firstName, c.surname, c.email, c.phone, c.clientType, c.source, c.gender, c.dob, merchant.id],
      );
    }

    // Create 3-6 appointments per client
    const numAppts = randomInt(3, 6);
    for (let a = 0; a < numAppts; a++) {
      const svc = pick(SERVICES);
      const svcIdx = SERVICES.indexOf(svc);
      const serviceId = serviceIds[svcIdx];
      const { date, time } = pastDateTime(180);
      const statuses = ['Completed', 'Completed', 'Completed', 'Confirmed', 'Cancelled'];
      const status = pick(statuses);
      const amount = svc.price;
      const paymentStatus = status === 'Cancelled' ? 'Unpaid' : 'Paid';

      const apptResult = await AppDataSource.query(
        `INSERT INTO appointments ("client_id", "business_id", "serviceName", date, time, duration, status, amount, "paymentStatus", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING id`,
        [existingUser.id, business.id, svc.name, date, time, svc.duration, status, amount, paymentStatus],
      );
      createdAppointments++;

      // Create transaction for completed appointments
      if (status === 'Completed') {
        await AppDataSource.query(
          `INSERT INTO transactions ("senderId", "recipientId", amount, reason, currency, type, description, service, "customerName", mode, status, method, "walletId", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'NGN', 'Earning', $5, $6, $7, 'Web', 'completed', 'Cash', $8, NOW(), NOW())`,
          [existingUser.id, merchant.id, amount, `Payment for ${svc.name}`, `Appointment - ${svc.name}`, svc.name, `${c.firstName} ${c.surname}`, wallet.id],
        );
        createdTransactions++;
      }

      // Create review for some completed appointments
      if (status === 'Completed' && Math.random() > 0.4) {
        const rating = (Math.random() > 0.2 ? randomInt(4, 5) : randomInt(2, 3)).toFixed(1);
        const reviews = [
          'Absolutely loved the service! Will definitely come back.',
          'Great experience, very professional stylist.',
          'Good service overall, happy with the results.',
          'Amazing transformation! exceeded my expectations.',
          'Decent service but room for improvement.',
          'Fantastic as always! Highly recommended.',
          'Loved the attention to detail. Very satisfied.',
          'The team was wonderful and made me feel comfortable.',
        ];

        await AppDataSource.query(
          `INSERT INTO reviews ("clientId", "ownerId", "businessId", rating, comment, "clientName", service, "clientType", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          [existingUser.id, merchant.id, business.id, rating, pick(reviews), `${c.firstName} ${c.surname}`, svc.name, c.clientType],
        );
        createdReviews++;
      }
    }
  }

  console.log('\n--- Seed Summary ---');
  console.log(`Clients created/verified: ${CLIENTS.length} (${createdClients} new users)`);
  console.log(`Appointments created: ${createdAppointments}`);
  console.log(`Transactions created: ${createdTransactions}`);
  console.log(`Reviews created: ${createdReviews}`);
  console.log('\nClient login password (all clients):', CLIENT_PASSWORD);

  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error('Failed to seed:', error.message, error.stack);
  process.exit(1);
});
