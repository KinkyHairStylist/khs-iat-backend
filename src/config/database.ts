import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { logger } from './logger';

dotenv.config();

const isProduction = process.env.NODE_ENV !== 'development';

/* ============================================================================
 * 📘 HOW TO ADD A NEW TABLE OR ALTER AN EXISTING ONE
 * ----------------------------------------------------------------------------
 * We intentionally keep `synchronize: false` (see baseOptions below) so TypeORM
 * NEVER auto-migrates the whole DB on boot. Instead, we opt-in per entity using
 * the SYNC_ONLY_TABLES env var. This scopes a temporary connection to ONLY the
 * entities you name and synchronizes just that slice — nothing else is touched.
 *
 * ── SCENARIO A: Adding a brand-new table ────────────────────────────────────
 *   1. Create the entity, e.g. src/user/entities/loyalty-point.entity.ts
 *
 *        @Entity('loyalty_points')
 *        export class LoyaltyPoint {
 *          @PrimaryGeneratedColumn('uuid') id: string;
 *          @Column() userId: string;
 *          @Column({ default: 0 }) balance: number;
 *        }
 *
 *   2. Make sure the file matches the entity glob: *.entity.ts  ✅
 *   3. Set the env var to the CLASS NAME (not the table name) and boot once:
 *
 *        SYNC_ONLY_TABLES=LoyaltyPoint
 *
 *      Expected log:
 *        [DB:...] Synchronizing only: [LoyaltyPoint]
 *        [DB:...] ✅ Synced 1 table(s): [LoyaltyPoint]
 *
 *   4. REMOVE the env var afterwards so it doesn't re-run on every deploy.
 *
 * ── SCENARIO B: Altering an existing table (add/rename a column) ─────────────
 *   1. Edit the entity, e.g. add a new column to LoyaltyPoint:
 *
 *        @Column({ nullable: true }) tier: string;   // 👈 new column
 *
 *      ⚠️ Always add new columns as `nullable: true` OR give a `default`,
 *         otherwise synchronize fails on tables that already have rows.
 *   2. Boot once with just that entity scoped:
 *
 *        SYNC_ONLY_TABLES=LoyaltyPoint
 *
 *      TypeORM diffs the entity vs the live table and issues the ALTER for you.
 *   3. Remove the env var again once the change is applied.
 *
 * ── SCENARIO C: Multiple tables at once ─────────────────────────────────────
 *        SYNC_ONLY_TABLES=LoyaltyPoint,Booking,User   (comma-separated, no spaces needed)
 *
 * ⚠️ WHAT `synchronize` WILL AND WON'T DO
 *   ✅ Creates missing tables, adds new columns, adds indexes/constraints.
 *   ❌ It does NOT safely drop/rename columns — TypeORM may DROP a column
 *      (losing data) if you rename in the entity. For renames/drops, write a
 *      manual SQL migration instead of relying on SYNC_ONLY_TABLES.
 * ==========================================================================*/

// Comma-separated entity CLASS NAMES you want force-synced even though
// other tables already exist, e.g. SYNC_ONLY_TABLES=User,Order
const SYNC_ONLY_TABLES = (process.env.SYNC_ONLY_TABLES ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

const baseOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'password',
  database: process.env.DB_DATABASE ?? 'khs',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : false, // Use SSL in production, but not in development

  synchronize: process.env.NODE_ENV === 'development',
  extra: {
    max: 5,
  },
};

// Backwards-compatible export: consumers (app.module + scripts) expect the
// raw DataSourceOptions under this name.
export const typeOrmConfig = baseOptions;

// Main app DataSource — always uses the full entity glob above.
export const AppDataSource = new DataSource(baseOptions);

let dbReady = false;
export const isDbReady = () => dbReady;
const setDbReady = (v: boolean) => {
  dbReady = v;
};

// Route DB logs through the central logger under a fixed context.
const DB_CTX = 'Database';
const log = {
  info: (...a: any[]) => logger.log(a.join(' '), DB_CTX),
  warn: (...a: any[]) => logger.warn(a.join(' '), DB_CTX),
  error: (...a: any[]) => logger.error(a.join(' '), undefined, DB_CTX),
};

const getExistingTableNames = async (
  dataSource: DataSource
): Promise<string[]> => {
  const rows: { table_name: string }[] = await dataSource.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`
  );
  return rows.map((r) => r.table_name);
};

/**
 * Creates a temporary, isolated DataSource that only knows about the
 * requested entity classes, then synchronizes just that schema slice.
 * This is how you sync ONE table without risking anything else: TypeORM
 * has no per-entity sync flag, so we scope a whole connection to it.
 */
const syncSpecificEntities = async (entityNames: string[]) => {
  const matched = AppDataSource.entityMetadatas.filter((meta) =>
    entityNames.includes(meta.name)
  );

  if (matched.length === 0) {
    log.warn(
      `SYNC_ONLY_TABLES was set but none of [${entityNames.join(', ')}] matched a known entity`
    );
    return;
  }

  const scopedDataSource = new DataSource({
    ...baseOptions,
    entities: matched.map((meta) => meta.target),
    synchronize: false,
  });

  await scopedDataSource.initialize();
  try {
    log.info(`Synchronizing only: [${matched.map((m) => m.name).join(', ')}]`);
    await scopedDataSource.synchronize();
    log.info(`✅ Synced ${matched.length} table(s): [${matched.map((m) => m.name).join(', ')}]`);
  } finally {
    await scopedDataSource.destroy();
  }
};

/**
 * - No tables in the DB at all -> full synchronize (first deploy only)
 * - Tables already exist ->
 *      - skip the global synchronize
 *      - if SYNC_ONLY_TABLES is set, sync only those specific entities
 */
const runSmartSync = async (dataSource: DataSource) => {
  const start = Date.now();
  const tablesBefore = await getExistingTableNames(dataSource);

  if (tablesBefore.length === 0) {
    log.info('No tables found, running full synchronize...');
    await dataSource.synchronize();

    const tablesAfter = await getExistingTableNames(dataSource);
    log.info(
      `${tablesAfter.length} table(s) created: [${tablesAfter.join(', ')}]`
    );
  } else {
    log.info(
      `Tables already exist (${tablesBefore.length}), skipping full synchronize`
    );

    if (SYNC_ONLY_TABLES.length > 0) {
      await syncSpecificEntities(SYNC_ONLY_TABLES);
    }
  }

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  log.info(`Schema check complete (took ${duration}s)`);
};

export const connectDB = async (): Promise<void> => {
  const initialDelay = 5000; // 5s
  const maxDelay = 30000; // 30s
  const factor = 2;
  let delay = initialDelay;

  while (true) {
    try {
      log.info('Attempting DB connection...');

      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }

      log.info('✅ Database CONNECTED');
      setDbReady(true);

      await runSmartSync(AppDataSource);

      return; // ✅ exit once connected + synced
    } catch (error: any) {
      let friendlyMessage = 'Unknown DB connection error';
      const code = error?.code ?? error?.name;

      if (code === 'ECONNREFUSED') {
        friendlyMessage = 'Database is still sleeping or refusing connections ❌';
      } else if (code === 'ETIMEDOUT') {
        friendlyMessage = 'Database connection attempt timed out ⏱️';
      } else if (code === 'ENOTFOUND') {
        friendlyMessage = 'Database host not found 🔍 — check your DB_HOST';
      } else if (error?.message?.includes('password authentication')) {
        friendlyMessage = 'Invalid DB credentials ⚙️';
      }

      logger.logError(error, 'Database', { friendlyMessage, code });
      setDbReady(false);

      log.warn(`🔄 Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      delay = Math.min(delay * factor, maxDelay);
    }
  }
};

let reconnecting = false;
let watchdogInterval: NodeJS.Timeout | null = null;

export const startDbWatchdog = (
  interval = isProduction ? 120000 : 15000,
  pingTimeout = 10000
) => {
  const pingLoop = async () => {
    try {
      await Promise.race([
        AppDataSource.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('DB ping timeout')), pingTimeout)
        ),
      ]);

      setDbReady(true);
      log.info('✅ Database is alive');
    } catch (err: any) {
      log.error('⚠️ Database ping failed. Reconnecting...');

      if (reconnecting) {
        log.warn('⏳ Reconnect already in progress, skipping...');
        return; // ← use return instead of else
      }

      reconnecting = true;
      setDbReady(false);

      try {
        if (AppDataSource.isInitialized) {
          await AppDataSource.destroy();
        }
        await AppDataSource.initialize();
        await AppDataSource.query('SELECT 1');

        log.info('🔄 Database reconnected successfully');
        setDbReady(true);
      } catch (reconnectErr: any) {
        log.error('❌ Failed to reconnect:', reconnectErr.message);
        setDbReady(false);
      } finally {
        reconnecting = false;
      }
    }
  };

  // Start the loop immediately
  pingLoop();
  watchdogInterval = setInterval(pingLoop, interval);
};

export const stopDbWatchdog = () => {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
    log.info('🛑 Database watchdog stopped');
  }
};

export const disconnectDB = async () => {
  try {
    log.warn('Attempting to shutdown database connection...');
    await AppDataSource.destroy();
    log.warn('Database connection closed');
  } catch (error) {
    log.error('Failed to disconnect database', error);
    throw new Error('Database FAILED to disconnect');
  }
};

  // 🔥 CRITICAL: Connection pool settings
  // poolSize: 10, // Maximum number of connections in the pool

  // // Additional pool configuration
  // extra: {
  //   max: 10, // Maximum pool size (same as poolSize for consistency)
  //   min: 2, // Minimum pool size (keep 2 connections always ready)
  //   idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  //   connectionTimeoutMillis: 2000, // Max wait time for connection (2s)
  //   statement_timeout: 30000, // Timeout for SQL statements (30s)
  //   query_timeout: 30000, // Query timeout (30s)
  // },

  // // Log slow queries (helpful for debugging)
  // logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : false,
  // maxQueryExecutionTime: 5000, // Log queries taking longer than 5s