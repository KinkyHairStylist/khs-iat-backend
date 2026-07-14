const { Client } = require('pg');
require('dotenv').config();

async function run() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'khs',
    ssl: false,
  });

  await client.connect();
  console.log('Connected to DB');

  await client.query(`
    CREATE TABLE IF NOT EXISTS "service_staff" (
      "serviceId" uuid NOT NULL,
      "staffId"   uuid NOT NULL,
      CONSTRAINT "PK_service_staff" PRIMARY KEY ("serviceId", "staffId"),
      CONSTRAINT "FK_service_staff_service" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_service_staff_staff"   FOREIGN KEY ("staffId")   REFERENCES "staff"("id")    ON DELETE CASCADE
    );
  `);
  console.log('✅ service_staff junction table created');

  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
