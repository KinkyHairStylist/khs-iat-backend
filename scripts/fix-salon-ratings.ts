import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// businesses.performance.rating/.reviews were seeded, and only recomputed when
// a new review is created (ReviewService.recomputeBusinessPerformance), so
// salons with no new review still show stars/counts that don't match the
// reviews table. This recomputes both from the reviews table and keeps
// completionRate/avgResponseMins untouched.
//
// Dry run by default (prints what would change). Pass --apply to write:
//   npm run fix:salon-ratings
//   npm run fix:salon-ratings -- --apply

const APPLY = process.argv.includes('--apply');
const LUXURY_MIN_RATING = 4.5; // same auto-luxury threshold as SalonService.findAll

const STALE_QUERY = `
  SELECT b.id::text AS id,
         b."businessName" AS name,
         b.status::text AS status,
         b."luxuryOverride" AS luxury_override,
         COALESCE((b.performance->>'rating')::float, 0) AS stored_rating,
         COALESCE((b.performance->>'reviews')::int, 0) AS stored_reviews,
         COALESCE(ROUND(r.avg_rating::numeric, 1), 0)::float AS real_rating,
         COALESCE(r.review_count, 0)::int AS real_reviews
  FROM businesses b
  LEFT JOIN (
    SELECT "businessId", AVG(rating) AS avg_rating, COUNT(*) AS review_count
    FROM reviews
    GROUP BY "businessId"
  ) r ON r."businessId" = b.id
`;

const isStale = (r: any) =>
  r.stored_rating !== r.real_rating || r.stored_reviews !== r.real_reviews;

const run = async () => {
  const ssl =
    process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false;
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl,
  });

  await client.connect();
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);

  try {
    const { rows } = await client.query(STALE_QUERY);
    const stale = rows.filter(isStale);

    console.log(`${rows.length} businesses, ${stale.length} with stored numbers that differ from the reviews table.`);
    console.table(
      stale.map((r) => ({
        name: r.name,
        status: r.status,
        stored: `${r.stored_rating} (${r.stored_reviews})`,
        real: `${r.real_rating} (${r.real_reviews})`,
      })),
    );

    // Salons that qualify for the Luxury filter through their rating alone
    // (no admin luxuryOverride) will change status when the rating changes.
    const autoLuxury = (rating: number, r: any) =>
      r.luxury_override === null && rating >= LUXURY_MIN_RATING;
    const approved = rows.filter((r) => r.status === 'approved');
    const loseLuxury = approved.filter((r) => autoLuxury(r.stored_rating, r) && !autoLuxury(r.real_rating, r));
    const gainLuxury = approved.filter((r) => !autoLuxury(r.stored_rating, r) && autoLuxury(r.real_rating, r));
    console.log(`Approved salons that would LOSE auto-Luxury: ${loseLuxury.length}; would GAIN it: ${gainLuxury.length}`);

    if (!APPLY) {
      console.log('Dry run only — nothing written. Re-run with --apply to update.');
      return;
    }
    if (stale.length === 0) {
      console.log('Nothing to update.');
      return;
    }

    await client.query('BEGIN');
    try {
      const res = await client.query(
        `UPDATE businesses b
         SET performance = COALESCE(b.performance, '{}'::jsonb)
                           || jsonb_build_object('rating', v.rating, 'reviews', v.reviews)
         FROM (
           SELECT unnest($1::text[]) AS id, unnest($2::float[]) AS rating, unnest($3::int[]) AS reviews
         ) v
         WHERE b.id::text = v.id`,
        [stale.map((r) => r.id), stale.map((r) => r.real_rating), stale.map((r) => r.real_reviews)],
      );
      await client.query('COMMIT');
      console.log(`✅ Updated ${res.rowCount} businesses.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const remaining = (await client.query(STALE_QUERY)).rows.filter(isStale).length;
    console.log(`Verification: ${remaining} businesses still differ from the reviews table.`);
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('Failed to fix salon ratings:', error);
  process.exitCode = 1;
});
