// One-off schema script: adds reviews.staffRating, a separate rating (1-5)
// for the staff member who performed a service, distinct from the existing
// overall `rating` column. Additive and nullable-safe.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/add-review-staff-rating-column.ts
//   apply:    ts-node --project tsconfig.json ./scripts/add-review-staff-rating-column.ts --execute
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const isExecute = process.argv.includes('--execute');

async function run() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  await ds.initialize();
  console.log(`Connected to ${process.env.DB_DATABASE}. Mode: ${isExecute ? 'EXECUTE' : 'DRY RUN (pass --execute to apply)'}\n`);

  const statements: { label: string; sql: string }[] = [
    {
      label: 'reviews.staffRating column',
      sql: `ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "staffRating" numeric(2,1);`,
    },
  ];

  for (const { label, sql } of statements) {
    console.log(`--- ${label} ---`);
    console.log(sql.trim());
    if (isExecute) {
      await ds.query(sql);
      console.log('APPLIED\n');
    } else {
      console.log('(dry run, not applied)\n');
    }
  }

  await ds.destroy();
}

run().catch((err) => {
  console.error('Schema script failed:', err);
  process.exit(1);
});
