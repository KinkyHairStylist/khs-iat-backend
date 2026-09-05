/**
 * ONE-OFF LOCAL DEV SCRIPT — seeds everything Kayode needs to manually
 * test the SPR-19-02 sprint on the UI:
 *
 *   - 2 approved merchants (so the gift-cards merchant filter has more
 *     than one option to filter by).
 *   - 5 services on merchant #1 (3 fixed-price + 2 variable-price) to
 *     verify Ticket 1 — variable services must render a range, not "—".
 *   - 3 services on merchant #2 (mix of fixed + variable).
 *   - 1 verified customer with 2 owned gift cards (well-known codes so
 *     Kayode can type them straight into the payment page).
 *   - Available-for-purchase gift cards from BOTH merchants for the
 *     Purchase Gift Cards grid.
 *
 * NOT for staging/production use — local testing only.
 *
 * Run with:
 *   npx ts-node scripts/seed-sprint19-demo.ts
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

// ----- Fixed test credentials -----------------------------------------------
const PASSWORD = 'Sprint19Pass!';

const MERCHANT1_EMAIL = 'khs.merchant@sprint19.local';
const MERCHANT2_EMAIL = 'khs.merchant2@sprint19.local';
const CUSTOMER_EMAIL = 'khs.customer@sprint19.local';

// Known gift-card codes so Kayode can type them directly into the
// payment page during Ticket 2 testing.
const OWNED_CODE_100 = 'KHSGIFT100';
const OWNED_CODE_50 = 'KHSGIFT50';

// ----- Data source ----------------------------------------------------------
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'khs',
  // Managed Postgres (DigitalOcean/AWS) forces SSL; DB_SSL=require in
  // .env is the switch. Self-signed certs need rejectUnauthorized:false.
  ssl:
    (process.env.DB_SSL ?? '').toLowerCase() === 'require' ||
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

// ----- Helpers --------------------------------------------------------------
type Role = 'merchant' | 'customer';

async function ensureUser(
  email: string,
  firstName: string,
  surname: string,
  role: Role,
) {
  const existing = await AppDataSource.query(
    `SELECT id FROM "user" WHERE email = $1`,
    [email],
  );
  if (existing.length > 0) return existing[0].id as string;

  const hash = await bcrypt.hash(PASSWORD, await bcrypt.genSalt(10));

  const flags =
    role === 'merchant'
      ? { isMerchant: true, isCustomer: true, isClient: false }
      : { isMerchant: false, isCustomer: true, isClient: true };

  const rows = await AppDataSource.query(
    `INSERT INTO "user" (
      email, password, "firstName", surname,
      "isVerified", "isStaff", "adminRole",
      "isMerchant", "isBusinessStaff", "businessStaffRole", "isCustomer", "isClient",
      "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, true, false, null, $5, false, null, $6, $7, NOW(), NOW())
    RETURNING id`,
    [email, hash, firstName, surname, flags.isMerchant, flags.isCustomer, flags.isClient],
  );
  return rows[0].id as string;
}

async function ensureBusiness(
  ownerId: string,
  ownerEmail: string,
  ownerName: string,
  businessName: string,
  address: string,
  lat: number,
  lng: number,
  categories: string[],
) {
  const existing = await AppDataSource.query(
    `SELECT id FROM businesses WHERE owner_id = $1`,
    [ownerId],
  );
  if (existing.length > 0) return existing[0].id as string;

  const rows = await AppDataSource.query(
    `INSERT INTO businesses (
      "businessName", description, owner_id, "ownerName", "ownerEmail", "ownerPhone",
      "primaryAudience", "businessAddress", "businessImage", longitude, latitude,
      "companySize", status, category, plan, performance, revenue, bookings, "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'approved', $13, 'Free', $14, 0, 0, NOW(), NOW())
    RETURNING id`,
    [
      businessName,
      `${businessName} — seeded for SPR-19-02 UI testing.`,
      ownerId,
      ownerName,
      ownerEmail,
      '+1234567890',
      'Everyone looking for quality beauty services',
      address,
      JSON.stringify([
        'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800',
      ]),
      lng,
      lat,
      'small-team',
      JSON.stringify(categories),
      JSON.stringify({
        rating: 4.7,
        reviews: 42,
        completionRate: 95,
        avgResponseMins: 15,
      }),
    ],
  );

  const businessId = rows[0].id as string;

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of days) {
    await AppDataSource.query(
      `INSERT INTO booking_days (day, "isOpen", "startTime", "endTime", "businessId") VALUES ($1, $2, $3, $4, $5)`,
      [day, day !== 'Sunday', day === 'Saturday' ? '10:00' : '09:00', day === 'Saturday' ? '18:00' : '19:00', businessId],
    );
  }

  return businessId;
}

interface ServiceSpec {
  name: string;
  category: string;
  serviceType: string;
  priceType: 'fixed' | 'variable';
  price: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  duration: string;
}

async function ensureServices(businessId: string, businessName: string, specs: ServiceSpec[]) {
  const existingCount: { count: string }[] = await AppDataSource.query(
    `SELECT COUNT(*) AS count FROM "Service" WHERE "businessId" = $1`,
    [businessId],
  );
  if (parseInt(existingCount[0].count, 10) >= specs.length) {
    return;
  }

  const image = 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800';
  for (const svc of specs) {
    await AppDataSource.query(
      `INSERT INTO "Service" (
        name, category, "serviceType", description,
        "priceType", price, "minPrice", "maxPrice",
        duration, images, "businessId", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      [
        svc.name,
        svc.category,
        svc.serviceType,
        `${svc.name} at ${businessName}.`,
        svc.priceType,
        svc.price,
        svc.minPrice,
        svc.maxPrice,
        svc.duration,
        [image],
        businessId,
      ],
    );
  }
}

async function ensureOwnedGiftCard(
  code: string,
  businessId: string,
  ownerId: string,
  ownerEmail: string,
  ownerFullName: string,
  amount: number,
  title: string,
  template: string,
) {
  const existing = await AppDataSource.query(
    `SELECT id FROM business_gift_cards WHERE code = $1`,
    [code],
  );
  if (existing.length > 0) return;

  await AppDataSource.query(
    `INSERT INTO business_gift_cards (
      "businessId", "ownerId", "ownerEmail", "ownerFullName",
      title, description, amount, "remainingAmount", benefits,
      code, template, "expiryInDays", "expiresAt",
      status, "soldStatus", "sentStatus",
      "recipientName", "recipientEmail", "senderName", currency
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $7, ARRAY['Redeemable for any service'],
      $8, $9, 365, NOW() + INTERVAL '365 days',
      'Active', 'purchased', 'delivered',
      $4, $3, 'KHS Demo', 'AUD'
    )`,
    [businessId, ownerId, ownerEmail, ownerFullName, title, `Seeded — ${title}`, amount, code, template],
  );
}

async function ensureAvailableGiftCard(
  code: string,
  businessId: string,
  amount: number,
  title: string,
  template: string,
) {
  const existing = await AppDataSource.query(
    `SELECT id FROM business_gift_cards WHERE code = $1`,
    [code],
  );
  if (existing.length > 0) return;

  await AppDataSource.query(
    `INSERT INTO business_gift_cards (
      "businessId", title, description, amount, "remainingAmount", benefits,
      code, template, "expiryInDays", "expiresAt",
      status, "soldStatus", "sentStatus",
      "recipientName", "recipientEmail", currency
    ) VALUES (
      $1, $2, $3, $4, $4, ARRAY['Redeemable for any service','Never expires within 1 year'],
      $5, $6, 365, NOW() + INTERVAL '365 days',
      'Active', 'available', 'sent',
      'Available for purchase', 'noreply@khs.local', 'AUD'
    )`,
    [businessId, title, `Purchasable gift card — ${title}`, amount, code, template],
  );
}

// ----- Main -----------------------------------------------------------------
async function main() {
  await AppDataSource.initialize();
  console.log('DB connected.\n');

  // ---- Merchants + Businesses ---------------------------------------------
  const merchant1Id = await ensureUser(MERCHANT1_EMAIL, 'Sprint', 'MerchantOne', 'merchant');
  const business1Id = await ensureBusiness(
    merchant1Id,
    MERCHANT1_EMAIL,
    'Sprint MerchantOne',
    'Sprint19 Salon (Sydney)',
    '10 George Street, Sydney NSW',
    -33.8688,
    151.2093,
    ['hair-services', 'nail-services'],
  );

  const merchant2Id = await ensureUser(MERCHANT2_EMAIL, 'Sprint', 'MerchantTwo', 'merchant');
  const business2Id = await ensureBusiness(
    merchant2Id,
    MERCHANT2_EMAIL,
    'Sprint MerchantTwo',
    'Sprint19 Studio (Melbourne)',
    '55 Collins Street, Melbourne VIC',
    -37.8136,
    144.9631,
    ['spa-treatments', 'skincare'],
  );

  // ---- Services on Merchant 1 (3 fixed + 2 variable) ----------------------
  await ensureServices(business1Id, 'Sprint19 Salon (Sydney)', [
    // Fixed-price — should show "$X" (Ticket 1 regression check).
    { name: "Women's Signature Haircut", category: 'hair-services', serviceType: 'women-haircut',
      priceType: 'fixed', price: 65, minPrice: null, maxPrice: null, duration: '45 mins' },
    { name: 'Classic Manicure', category: 'nail-services', serviceType: 'manicure',
      priceType: 'fixed', price: 40, minPrice: null, maxPrice: null, duration: '30 mins' },
    { name: 'Deep Conditioning Treatment', category: 'hair-services', serviceType: 'hair-treatment',
      priceType: 'fixed', price: 55, minPrice: null, maxPrice: null, duration: '30 mins' },
    // Variable-price — Ticket 1 fix: must render "$X - $Y".
    { name: 'Full Hair Coloring (Consultation-based)', category: 'hair-services', serviceType: 'hair-coloring',
      priceType: 'variable', price: null, minPrice: 120, maxPrice: 300, duration: '90 mins' },
    // Variable-price with only minPrice — should render "From $X".
    { name: 'Bridal Package (Custom)', category: 'hair-services', serviceType: 'women-haircut',
      priceType: 'variable', price: null, minPrice: 250, maxPrice: null, duration: '120 mins' },
  ]);

  // ---- Services on Merchant 2 (2 fixed + 1 variable) ----------------------
  await ensureServices(business2Id, 'Sprint19 Studio (Melbourne)', [
    { name: 'Rejuvenating Facial', category: 'spa-treatments', serviceType: 'facial',
      priceType: 'fixed', price: 90, minPrice: null, maxPrice: null, duration: '60 mins' },
    { name: 'Relaxation Massage', category: 'spa-treatments', serviceType: 'massage',
      priceType: 'fixed', price: 110, minPrice: null, maxPrice: null, duration: '60 mins' },
    { name: 'Acne Treatment (Course-based)', category: 'skincare', serviceType: 'acne-treatment',
      priceType: 'variable', price: null, minPrice: 80, maxPrice: 220, duration: '45 mins' },
  ]);

  // ---- Customer + owned gift cards ----------------------------------------
  const customerId = await ensureUser(CUSTOMER_EMAIL, 'Sprint', 'Customer', 'customer');

  await ensureOwnedGiftCard(
    OWNED_CODE_100, business1Id, customerId, CUSTOMER_EMAIL, 'Sprint Customer',
    100, 'Big Balance Gift Card ($100)', 'general',
  );
  await ensureOwnedGiftCard(
    OWNED_CODE_50, business2Id, customerId, CUSTOMER_EMAIL, 'Sprint Customer',
    50, 'Small Balance Gift Card ($50)', 'birthday',
  );

  // ---- Available-for-purchase gift cards (both merchants) -----------------
  await ensureAvailableGiftCard('KHSSHOP-B1-CHRISTMAS', business1Id, 75, 'Christmas Gift Card', 'christmas');
  await ensureAvailableGiftCard('KHSSHOP-B1-WEDDING', business1Id, 150, 'Wedding Gift Card', 'wedding');
  await ensureAvailableGiftCard('KHSSHOP-B1-BIRTHDAY', business1Id, 50, 'Birthday Gift Card', 'birthday');
  await ensureAvailableGiftCard('KHSSHOP-B2-MOTHERS', business2Id, 100, 'Mother\'s Day Gift Card', 'mothers');
  await ensureAvailableGiftCard('KHSSHOP-B2-GRADUATION', business2Id, 60, 'Graduation Gift Card', 'graduation');
  await ensureAvailableGiftCard('KHSSHOP-B2-ANNIVERSARY', business2Id, 200, 'Anniversary Gift Card', 'anniversary');

  // ---- Report -------------------------------------------------------------
  console.log('=== Seed complete ===\n');
  console.log('MERCHANT 1');
  console.log(`  email:    ${MERCHANT1_EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  business: Sprint19 Salon (Sydney) — 5 services (3 fixed + 2 variable)`);
  console.log('');
  console.log('MERCHANT 2 (for merchant-filter test)');
  console.log(`  email:    ${MERCHANT2_EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  business: Sprint19 Studio (Melbourne) — 3 services (2 fixed + 1 variable)`);
  console.log('');
  console.log('CUSTOMER');
  console.log(`  email:    ${CUSTOMER_EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  owned gift cards:`);
  console.log(`    ${OWNED_CODE_100} — $100 balance (from Merchant 1)`);
  console.log(`    ${OWNED_CODE_50}  — $50 balance  (from Merchant 2)`);
  console.log('');
  console.log('AVAILABLE GIFT CARDS (Purchase Gift Cards grid):');
  console.log('  6 total: 3 from Merchant 1 + 3 from Merchant 2 (multiple templates).');

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Sprint19 seed failed:', err);
  process.exit(1);
});
