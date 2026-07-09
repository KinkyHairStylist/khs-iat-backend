// Seed script for landing content management tables
// Run: node scripts/seed-landing.js

const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'khs_local_pass',
  database: process.env.DB_DATABASE || 'khs',
});

async function seed() {
  await client.connect();
  console.log('Connected to DB');

  // ── Create tables if they don't exist ────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR NOT NULL,
      slug VARCHAR UNIQUE NOT NULL,
      excerpt TEXT,
      content TEXT NOT NULL,
      "coverImage" VARCHAR,
      author VARCHAR,
      "isPublished" BOOLEAN NOT NULL DEFAULT false,
      "publishedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS testimonials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR NOT NULL,
      role VARCHAR,
      content TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 5,
      avatar VARCHAR,
      "isApproved" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS faqs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question VARCHAR NOT NULL,
      answer TEXT NOT NULL,
      category VARCHAR,
      "displayOrder" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS stories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR NOT NULL,
      role VARCHAR,
      quote TEXT NOT NULL,
      image VARCHAR,
      "isPublished" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS landing_statistics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      label VARCHAR NOT NULL,
      description TEXT NOT NULL,
      icon VARCHAR,
      "displayOrder" INTEGER NOT NULL DEFAULT 0,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR UNIQUE NOT NULL,
      "subscribedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  console.log('✓ Tables ready');

  // ── Blog Posts ────────────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO blog_posts (id, title, slug, excerpt, content, "coverImage", author, "isPublished", "publishedAt", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), 'Top 10 Kinky Hair Styles for 2025', 'top-10-kinky-hair-styles-2025',
       'Discover the hottest kinky hair styles taking over this year.',
       'From twisted locs to afro puffs, 2025 is all about celebrating natural texture. Here are our top 10 picks curated by our stylist community...',
       NULL, 'Amara Osei', true, NOW(), NOW(), NOW()),

      (gen_random_uuid(), 'How to Moisturise 4C Hair the Right Way', 'how-to-moisturise-4c-hair',
       'The LOC method and why your 4C strands will thank you.',
       'Moisture retention is the biggest challenge for 4C hair. In this post we break down the LOC (Liquid, Oil, Cream) method step by step...',
       NULL, 'Titi Adeyemi', true, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW()),

      (gen_random_uuid(), 'Protective Styles That Last 6+ Weeks (Draft)', 'protective-styles-6-weeks',
       'Long-lasting styles that keep your ends safe.',
       'Box braids, knotless braids, faux locs — we rank the protective styles with the longest lifespan and least tension on your edges...',
       NULL, 'Kezia Brown', false, NULL, NOW(), NOW())
    ON CONFLICT (slug) DO NOTHING;
  `);
  console.log('✓ blog_posts seeded');

  // ── Testimonials ──────────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO testimonials (id, name, role, content, rating, avatar, "isApproved", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), 'Funke Adeleke', 'Client', 'Absolutely love this platform! Found my go-to natural hair stylist in under 5 minutes. 10/10.', 5, NULL, true, NOW(), NOW()),
      (gen_random_uuid(), 'Chisom Okafor', 'Client', 'Booking was seamless and the stylist was amazing. My locs have never looked better!', 5, NULL, true, NOW() - INTERVAL '2 days', NOW()),
      (gen_random_uuid(), 'Bisola Martins', 'Partner Stylist', 'As a stylist, this platform helped me grow my clientele by 40% in three months.', 5, NULL, true, NOW() - INTERVAL '7 days', NOW()),
      (gen_random_uuid(), 'Anonymous User', NULL, 'Decent experience overall but the wait time was a bit long.', 3, NULL, false, NOW() - INTERVAL '1 day', NOW()),
      (gen_random_uuid(), 'Ngozi Emmanuel', 'Client', 'Spam testimonial for testing rejection flow.', 1, NULL, false, NOW() - INTERVAL '3 hours', NOW())
    ON CONFLICT DO NOTHING;
  `);
  console.log('✓ testimonials seeded (3 approved, 2 pending)');

  // ── FAQs ─────────────────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO faqs (id, question, answer, category, "displayOrder", "isActive", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), 'How do I book an appointment?', 'Simply search for a stylist near you, choose a service, pick a time slot and confirm your booking. Payment is handled securely through our platform.', 'Booking', 1, true, NOW(), NOW()),
      (gen_random_uuid(), 'Can I cancel or reschedule?', 'Yes. You can cancel or reschedule up to 24 hours before your appointment at no charge. Cancellations within 24 hours may incur a fee.', 'Booking', 2, true, NOW(), NOW()),
      (gen_random_uuid(), 'How do stylists get paid?', 'Stylists receive payouts via Paystack directly to their bank account within 1–3 business days after a completed appointment.', 'Payments', 3, true, NOW(), NOW()),
      (gen_random_uuid(), 'Is my payment information safe?', 'Absolutely. All payments are processed via Paystack with bank-grade encryption. We never store your card details on our servers.', 'Payments', 4, true, NOW(), NOW()),
      (gen_random_uuid(), 'How do I become a partner stylist?', 'Register a business account, complete your profile, and submit your application. Our team reviews applications within 2–3 business days.', 'Stylist', 5, true, NOW(), NOW()),
      (gen_random_uuid(), 'This FAQ is hidden (inactive)', 'This answer will not show on the public site.', 'General', 6, false, NOW(), NOW())
    ON CONFLICT DO NOTHING;
  `);
  console.log('✓ faqs seeded (5 active, 1 inactive)');

  // ── Stories ───────────────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO stories (id, name, role, quote, image, "isPublished", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), 'Adaeze Nwosu', 'Client from Lagos', 'I had been struggling to find a stylist who truly understands 4C hair. KHS changed that completely.', NULL, true, NOW(), NOW()),
      (gen_random_uuid(), 'Zara Mensah', 'Partner Stylist — Accra', 'I turned my passion into a full-time business. The platform handles bookings so I can focus on the craft.', NULL, true, NOW() - INTERVAL '3 days', NOW()),
      (gen_random_uuid(), 'Ife Oduya', 'Client from Abuja', 'Draft story — not yet published.', NULL, false, NOW(), NOW())
    ON CONFLICT DO NOTHING;
  `);
  console.log('✓ stories seeded (2 published, 1 draft)');

  // ── Landing Statistics ────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO landing_statistics (id, label, description, icon, "displayOrder", "isActive", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), '10,000+ Clients', 'Happy clients who have booked through our platform', 'users', 1, true, NOW(), NOW()),
      (gen_random_uuid(), '500+ Stylists', 'Verified partner stylists across Nigeria and Ghana', 'scissors', 2, true, NOW(), NOW()),
      (gen_random_uuid(), '4.9 / 5 Rating', 'Average rating from verified post-appointment reviews', 'star', 3, true, NOW(), NOW()),
      (gen_random_uuid(), '98% Satisfaction', 'Of clients said they would rebook the same stylist', 'heart', 4, true, NOW(), NOW()),
      (gen_random_uuid(), 'Hidden Stat (inactive)', 'This stat is not shown on the landing page', NULL, 5, false, NOW(), NOW())
    ON CONFLICT DO NOTHING;
  `);
  console.log('✓ landing_statistics seeded (4 active, 1 inactive)');

  // ── Newsletter Subscribers ────────────────────────────────────────────────
  await client.query(`
    INSERT INTO newsletter_subscribers (id, email, "subscribedAt")
    VALUES
      (gen_random_uuid(), 'test.user1@example.com', NOW()),
      (gen_random_uuid(), 'naturalhairl0ver@gmail.com', NOW() - INTERVAL '1 day'),
      (gen_random_uuid(), 'kinky.fan@outlook.com', NOW() - INTERVAL '3 days'),
      (gen_random_uuid(), 'stylist.bookings@yahoo.com', NOW() - INTERVAL '7 days')
    ON CONFLICT (email) DO NOTHING;
  `);
  console.log('✓ newsletter_subscribers seeded');

  await client.end();
  console.log('\nAll landing content seeded successfully.');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  client.end();
  process.exit(1);
});
