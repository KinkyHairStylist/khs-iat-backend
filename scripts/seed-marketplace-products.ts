import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { typeOrmConfig } from '../src/config/database';

dotenv.config();

const SEED_TAG = '[SEED_MKT]';
const BUSINESS_NAME = 'KHS Seed Salon Appointment Hub';
const OWNER_EMAIL = 'alt.rl-61irtmx@yopmail.com';
const SEED_PASSWORD = 'Password123';

const connectClient = async () => {
  const config = typeOrmConfig as {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl?: object;
  };

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl || false,
  });
  await client.connect();
  return client;
};

const upsertUser = async (client: Client) => {
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, 10);
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO "user" (
        email,
        "firstName",
        surname,
        "phoneNumber",
        password,
        "isVerified",
        "isMerchant",
        "isCustomer",
        activity
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, FALSE, NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        "firstName" = EXCLUDED."firstName",
        surname = EXCLUDED.surname,
        "phoneNumber" = EXCLUDED."phoneNumber",
        password = EXCLUDED.password,
        "isMerchant" = EXCLUDED."isMerchant",
        "isCustomer" = EXCLUDED."isCustomer"
      RETURNING id
    `,
    [OWNER_EMAIL, 'Ifeanyi', 'Gold', '+2348012345000', hashedPassword],
  );

  return result.rows[0].id;
};

const upsertBusiness = async (client: Client, ownerId: string) => {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM businesses WHERE "businessName" = $1 LIMIT 1`,
    [BUSINESS_NAME],
  );

  if (existing.rowCount > 0) {
    await client.query(
      `
        UPDATE businesses
        SET
          "owner_id" = $2,
          "ownerName" = $3,
          "ownerEmail" = $4,
          "ownerPhone" = $5,
          status = 'approved',
          plan = 'Enterprise',
          "businessAddress" = $6
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        ownerId,
        'Ifeanyi Gold',
        OWNER_EMAIL,
        '+2348012345000',
        'Lekki Phase 1, Lagos, Nigeria',
      ],
    );

    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO businesses (
        "businessName",
        description,
        "owner_id",
        "ownerName",
        "ownerEmail",
        "ownerPhone",
        "primaryAudience",
        "businessAddress",
        longitude,
        latitude,
        "companySize",
        status,
        plan,
        performance
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        'multi-staff',
        'approved',
        'Enterprise',
        $11::jsonb
      )
      RETURNING id
    `,
    [
      BUSINESS_NAME,
      'Seeded business for marketplace product QA scenarios',
      ownerId,
      'Ifeanyi Gold',
      OWNER_EMAIL,
      '+2348012345000',
      'Natural hair and beauty customers',
      'Lekki Phase 1, Lagos, Nigeria',
      3.4812,
      6.4474,
      JSON.stringify({
        rating: 4.8,
        reviews: 120,
        completionRate: 96,
        avgResponseMins: 8,
      }),
    ],
  );

  return inserted.rows[0].id;
};

const clearSeededProducts = async (client: Client) => {
  await client.query(
    `DELETE FROM inventory_products WHERE "productName" LIKE $1`,
    [`${SEED_TAG}%`],
  );
};

const seedProducts = async (
  client: Client,
  ownerId: string,
  businessId: string,
) => {
  const products = [
    {
      productName: `${SEED_TAG} Curly Hair Serum`,
      description: 'Hydrating serum for natural curls and coils.',
      sellingPrice: 4500,
      costPrice: 2200,
      currency: 'NGN',
      sku: 'MKT-SERUM-001',
      stockQuantity: 50,
      category: 'hair_care',
      shippingStatus: 'not_shipped',
      shippingProgress: 0,
      shippingDays: 0,
      shippingOrders: 0,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Silk Edge Control`,
      description: 'Strong hold edge control for sleek styles.',
      sellingPrice: 3200,
      costPrice: 1400,
      currency: 'NGN',
      sku: 'MKT-EDGE-002',
      stockQuantity: 80,
      category: 'hair_care',
      shippingStatus: 'not_shipped',
      shippingProgress: 0,
      shippingDays: 0,
      shippingOrders: 0,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Nourishing Face Oil`,
      description: 'Lightweight oil for glowing skin.',
      sellingPrice: 3800,
      costPrice: 1800,
      currency: 'NGN',
      sku: 'MKT-OIL-003',
      stockQuantity: 40,
      category: 'skin_care',
      shippingStatus: 'processing',
      shippingProgress: 15,
      shippingDays: 2,
      shippingOrders: 1,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Brow Defining Kit`,
      description: 'Complete kit for defined brows on every look.',
      sellingPrice: 5200,
      costPrice: 2500,
      currency: 'NGN',
      sku: 'MKT-BROW-004',
      stockQuantity: 25,
      category: 'brow',
      shippingStatus: 'processing',
      shippingProgress: 30,
      shippingDays: 3,
      shippingOrders: 1,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Travel Styling Comb`,
      description: 'Portable wide-tooth comb for wet and dry hair.',
      sellingPrice: 1200,
      costPrice: 450,
      currency: 'NGN',
      sku: 'MKT-COMB-005',
      stockQuantity: 100,
      category: 'tools_equipment',
      shippingStatus: 'shipped',
      shippingProgress: 60,
      shippingDays: 1,
      shippingOrders: 3,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Lash Growth Serum`,
      description: 'Serum to support fuller lashes in 4 weeks.',
      sellingPrice: 4700,
      costPrice: 2100,
      currency: 'NGN',
      sku: 'MKT-LASH-006',
      stockQuantity: 35,
      category: 'lash',
      shippingStatus: 'shipped',
      shippingProgress: 55,
      shippingDays: 1,
      shippingOrders: 2,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Heat Protectant Spray`,
      description: 'Protects hair from styling heat damage.',
      sellingPrice: 3900,
      costPrice: 1900,
      currency: 'NGN',
      sku: 'MKT-SPRAY-007',
      stockQuantity: 60,
      category: 'styling_products',
      shippingStatus: 'in_transit',
      shippingProgress: 70,
      shippingDays: 2,
      shippingOrders: 5,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Deep Conditioning Mask`,
      description: 'Rich mask for weekly deep conditioning.',
      sellingPrice: 5800,
      costPrice: 2700,
      currency: 'NGN',
      sku: 'MKT-MASK-008',
      stockQuantity: 30,
      category: 'hair_care',
      shippingStatus: 'in_transit',
      shippingProgress: 75,
      shippingDays: 3,
      shippingOrders: 6,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Daily Moisturizer`,
      description: 'Everyday moisturizer for normal to dry skin.',
      sellingPrice: 3100,
      costPrice: 1600,
      currency: 'NGN',
      sku: 'MKT-MOIST-009',
      stockQuantity: 45,
      category: 'skin_care',
      shippingStatus: 'delivered',
      shippingProgress: 100,
      shippingDays: 4,
      shippingOrders: 8,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Nail Care Duo`,
      description: 'Nail oil and strengthening serum combo.',
      sellingPrice: 6200,
      costPrice: 3000,
      currency: 'NGN',
      sku: 'MKT-NAIL-010',
      stockQuantity: 20,
      category: 'nail_care',
      shippingStatus: 'delivered',
      shippingProgress: 100,
      shippingDays: 5,
      shippingOrders: 9,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Conditioned Hair Oil`,
      description: 'Nourishing oil for scalp and ends.',
      sellingPrice: 5400,
      costPrice: 2400,
      currency: 'NGN',
      sku: 'MKT-OIL-011',
      stockQuantity: 42,
      category: 'hair_care',
      shippingStatus: 'cancelled',
      shippingProgress: 0,
      shippingDays: 0,
      shippingOrders: 0,
      productImage: null,
    },
    {
      productName: `${SEED_TAG} Styling Glove Set`,
      description: 'Heat-resistant gloves for styling and blow-drying.',
      sellingPrice: 2100,
      costPrice: 900,
      currency: 'NGN',
      sku: 'MKT-GLOVE-012',
      stockQuantity: 70,
      category: 'tools_equipment',
      shippingStatus: 'cancelled',
      shippingProgress: 0,
      shippingDays: 0,
      shippingOrders: 0,
      productImage: null,
    },
  ];

  for (const product of products) {
    await client.query(
      `
        INSERT INTO inventory_products (
          "productName",
          description,
          "ownerId",
          "businessId",
          "sellingPrice",
          "costPrice",
          currency,
          sku,
          "stockQuantity",
          category,
          "shippingStatus",
          "shippingProgress",
          "shippingDays",
          "shippingOrders",
          "productImage",
          "lowStockThreshold",
          "isActive",
          "createdAt",
          "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, 10, TRUE, NOW(), NOW()
        )
      `,
      [
        product.productName,
        product.description,
        ownerId,
        businessId,
        product.sellingPrice,
        product.costPrice,
        product.currency,
        product.sku,
        product.stockQuantity,
        product.category,
        product.shippingStatus,
        product.shippingProgress,
        product.shippingDays,
        product.shippingOrders,
        product.productImage,
      ],
    );
  }

  return products.length;
};

const seedMarketplaceProducts = async () => {
  const client = await connectClient();

  try {
    console.log('Connected to DB. Starting marketplace product seed...');
    await client.query('BEGIN');

    const ownerId = await upsertUser(client);
    const businessId = await upsertBusiness(client, ownerId);
    await clearSeededProducts(client);
    const count = await seedProducts(client, ownerId, businessId);

    await client.query('COMMIT');
    console.log(
      `Seeded ${count} marketplace products for business ${BUSINESS_NAME}.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Marketplace seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

seedMarketplaceProducts().catch((error) => {
  console.error('Seed process failed:', error);
  process.exit(1);
});
