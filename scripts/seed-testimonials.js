// Seed rejected and pending testimonials
// Run: node scripts/seed-testimonials.js

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

  // Add isRejected column if it doesn't exist yet
  await client.query(`
    ALTER TABLE testimonials
    ADD COLUMN IF NOT EXISTS "isRejected" BOOLEAN NOT NULL DEFAULT false;
  `);
  console.log('isRejected column ensured');

  // Pending testimonials (isApproved=false, isRejected=false)
  await client.query(`
    INSERT INTO testimonials (name, role, content, rating, "isApproved", "isRejected")
    VALUES
      ('Fatima Bello', 'Nurse', 'I have been looking for a stylist who truly understands natural hair. Finally found her through KHS!', 4, false, false),
      ('Chinwe Obi', 'Teacher', 'Booked my first appointment last week. Still waiting but the platform looks really promising.', 5, false, false),
      ('Adaeze Nwosu', 'Student', 'Great experience so far. Would love to see more stylists in my area though.', 3, false, false)
    ON CONFLICT DO NOTHING;
  `);
  console.log('Pending testimonials seeded');

  // Rejected testimonials (isApproved=false, isRejected=true)
  await client.query(`
    INSERT INTO testimonials (name, role, content, rating, "isApproved", "isRejected")
    VALUES
      ('Anonymous User', NULL, 'This is spam content with a link: buy-cheap-products.com', 1, false, true),
      ('Tunde A.', 'Customer', 'Very disappointing. Nothing works as expected and nobody responds to messages.', 1, false, true)
    ON CONFLICT DO NOTHING;
  `);
  console.log('Rejected testimonials seeded');

  await client.end();
  console.log('Done.');
}

seed().catch((err) => {
  console.error(err);
  client.end();
  process.exit(1);
});
