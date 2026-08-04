import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'ep-ancient-tree-adzpdpp5-pooler.c-2.us-east-1.aws.neon.tech',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'neondb_owner',
  password: process.env.DB_PASSWORD ?? 'npg_1KxI4tXhWRuH',
  database: process.env.DB_DATABASE ?? 'neondb',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await AppDataSource.initialize();
  console.log("Connected to Neon database for seeding products & giftcards...");

  // Find target merchant business
  const targetEmail = 'proiquovizoiho-6823@yopmail.com';
  const businesses = await AppDataSource.query(
    'SELECT id, "owner_id" FROM "businesses" WHERE "ownerEmail" = $1 LIMIT 1',
    [targetEmail]
  );

  if (businesses.length === 0) {
    console.error(`Business for merchant ${targetEmail} not found!`);
    await AppDataSource.destroy();
    return;
  }

  const { id: businessId, owner_id: ownerId } = businesses[0];
  console.log(`Found business ID: ${businessId}, owner ID: ${ownerId}`);

  // 1. Seed Products into "inventory_products"
  console.log("Seeding sample inventory products...");
  await AppDataSource.query(
    'DELETE FROM "inventory_products" WHERE "businessId" = $1',
    [businessId]
  );

  const sampleProducts = [
    {
      productName: 'Hydrating Keratin Shampoo',
      sellingPrice: 45.00,
      costPrice: 22.50,
      sku: 'SHAMP-KER-001',
      stockQuantity: 25,
      lowStockThreshold: 5,
      category: 'hair-care',
      isActive: true,
      description: 'Professional hydrating shampoo infused with keratin.'
    },
    {
      productName: 'Argan Nourishing Hair Oil',
      sellingPrice: 65.00,
      costPrice: 30.00,
      sku: 'OIL-ARG-002',
      stockQuantity: 3,
      lowStockThreshold: 5, // Triggers "low stock" warning
      category: 'hair-care',
      isActive: true,
      description: 'Nourishing oil for dry, damaged hair.'
    },
    {
      productName: 'Professional Wide-Plate Straightener',
      sellingPrice: 180.00,
      costPrice: 90.00,
      sku: 'TOOL-STRAI-003',
      stockQuantity: 10,
      lowStockThreshold: 2,
      category: 'tools_equipment',
      isActive: true,
      description: 'Titanium wide plate straightener with digital temperature control.'
    },
    {
      productName: 'Styling Gel Ultra Hold',
      sellingPrice: 25.00,
      costPrice: 10.00,
      sku: 'GEL-ULT-004',
      stockQuantity: 0, // Triggers "out of stock" alert
      lowStockThreshold: 5,
      category: 'styling-products',
      isActive: true,
      description: 'Ultra hold styling gel for curly hair.'
    }
  ];

  for (const prod of sampleProducts) {
    await AppDataSource.query(
      `INSERT INTO "inventory_products" (
        "id", "productName", "ownerId", "businessId", "sellingPrice", "costPrice",
        "currency", "sku", "stockQuantity", "lowStockThreshold", "category",
        "isActive", "description", "createdAt", "updatedAt"
      ) VALUES (
        DEFAULT, $1, $2, $3, $4, $5, 'AUD', $6, $7, $8, $9, $10, $11, NOW(), NOW()
      )`,
      [
        prod.productName, ownerId, businessId, prod.sellingPrice, prod.costPrice,
        prod.sku, prod.stockQuantity, prod.lowStockThreshold, prod.category,
        prod.isActive, prod.description
      ]
    );
  }

  // 2. Seed Gift Cards into "business_gift_cards"
  console.log("Seeding sample business gift cards...");
  await AppDataSource.query(
    'DELETE FROM "business_gift_cards" WHERE "businessId" = $1',
    [businessId]
  );

  const sampleGiftCards = [
    {
      title: 'Kinky Hair Stylist Gift Card $100',
      description: 'Can be redeemed for any hair treatment or product.',
      amount: 100.00,
      code: 'KHS-GIFT-100-XYZ',
      template: 'birthday',
      recipientName: 'Maria Garcia',
      recipientEmail: 'maria.garcia@example.com',
      message: 'Happy Birthday Maria! Hope you enjoy your spa day.',
      senderName: 'Jesse Ola-Israel',
      status: 'Active',
      soldStatus: 'purchased'
    },
    {
      title: 'Holiday Spa Package Gift Card $250',
      description: 'Redeemable for luxury blowout and color services.',
      amount: 250.00,
      code: 'KHS-HOLIDAY-250-ABC',
      template: 'general',
      recipientName: 'Jennifer Davis',
      recipientEmail: 'jennifer.davis@example.com',
      message: 'Merry Christmas Jenn! Thanks for being an amazing friend.',
      senderName: 'Jesse Ola-Israel',
      status: 'Active',
      soldStatus: 'purchased'
    },
    {
      title: 'Promo Welcome Card $20',
      description: 'Welcome gift card for new clients.',
      amount: 20.00,
      code: 'KHS-WELCOME-20-PRO',
      template: 'general',
      recipientName: 'New Client',
      recipientEmail: 'newclient@example.com',
      message: 'Welcome to KHS!',
      senderName: 'Merchant Admin',
      status: 'Active',
      soldStatus: 'available'
    }
  ];

  for (const gc of sampleGiftCards) {
    await AppDataSource.query(
      `INSERT INTO "business_gift_cards" (
        "id", "ownerId", "ownerEmail", "ownerFullName", "businessId", "title",
        "description", "amount", "remainingAmount", "benefits", "code",
        "template", "expiryInDays", "expiresAt", "status", "soldStatus",
        "sentStatus", "recipientName", "recipientEmail", "message", "currency",
        "senderName", "createdAt", "updatedAt"
      ) VALUES (
        DEFAULT, $1, $2, 'Jesse Ola-Israel', $3, $4, $5, $6, $6, $7, $8, $9, 365,
        NOW() + interval '365 days', $10, $11, 'sent', $12, $13, $14, 'AUD', $15, NOW(), NOW()
      )`,
      [
        ownerId, targetEmail, businessId, gc.title, gc.description, gc.amount,
        ['Hair Cut', 'Coloring'], gc.code, gc.template, gc.status, gc.soldStatus,
        gc.recipientName, gc.recipientEmail, gc.message, gc.senderName
      ]
    );
  }

  console.log("Successfully seeded inventory products and business gift cards!");
  await AppDataSource.destroy();
}

main().catch(console.error);
