import 'dotenv/config';
import { AppDataSource } from '../src/config/database';

// Dry-run: asks TypeORM's schema builder what it WOULD run to bring the live
// DB in sync with the entities, without executing anything. This is the same
// engine `synchronize()` uses internally, so it accounts for column types,
// enums, indices, defaults, etc. more reliably than a manual diff.
async function main() {
  await AppDataSource.initialize();
  console.log('DB connected\n');

  const sqlInMemory = await AppDataSource.driver.createSchemaBuilder().log();

  const upQueries = sqlInMemory.upQueries.map((q) => q.query);

  const destructive: string[] = [];
  const additive: string[] = [];

  for (const q of upQueries) {
    const isDestructive =
      /DROP COLUMN/i.test(q) ||
      /DROP TABLE/i.test(q) ||
      (/ALTER COLUMN/i.test(q) && /TYPE/i.test(q)) ||
      /DROP CONSTRAINT/i.test(q) && /DROP COLUMN/i.test(q);
    (isDestructive ? destructive : additive).push(q);
  }

  console.log(`Total pending changes: ${upQueries.length}`);
  console.log(`  Additive (safe):     ${additive.length}`);
  console.log(`  Destructive (risky): ${destructive.length}\n`);

  if (additive.length) {
    console.log('=== ADDITIVE (new tables/columns/types/indices) ===\n');
    additive.forEach((q, i) => console.log(`-- [${i + 1}]\n${q};\n`));
  }

  if (destructive.length) {
    console.log('=== DESTRUCTIVE (would DROP or retype existing data) ===\n');
    destructive.forEach((q, i) => console.log(`-- [${i + 1}]\n${q};\n`));
  }

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
