// One-off data script: salons have always been emailed about new bookings, but
// the New Booking / Cancellation alert switches were stored as off unless a
// merchant turned them on, and nothing read them. Now that the booking flow
// honours them, this makes "on" the default and turns them on for rows nobody
// ever touched (all four notification switches still at their old default of
// off), so those salons don't silently stop getting booking emails. Rows where a
// merchant switched anything on are left exactly as they are.
//
// Prints every row it would change / changed, with the old values, so it can be
// reversed by hand.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/enable-booking-alert-defaults.ts
//   apply:    ts-node --project tsconfig.json ./scripts/enable-booking-alert-defaults.ts --execute
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const isExecute = process.argv.includes('--execute');

const TABLE = '"business_owner_settings"';
const NEW_BOOKING = '"notificationsBusinessNotificationsNewbookingalerts"';
const CANCELLATION = '"notificationsBusinessNotificationsCancellationalerts"';
const DAILY = '"notificationsBusinessNotificationsDailysummaryreports"';
const REMINDERS = '"notificationsEnableautomatedreminders"';

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

  const untouchedWhere = `${NEW_BOOKING} = false AND ${CANCELLATION} = false AND ${DAILY} = false AND ${REMINDERS} = false`;

  const rows: { id: string; businessId: string }[] = await ds.query(
    `SELECT id, "businessId" FROM ${TABLE} WHERE ${untouchedWhere}`,
  );
  const total: { n: string }[] = await ds.query(`SELECT count(*) AS n FROM ${TABLE}`);
  console.log(`${rows.length} of ${total[0].n} settings rows are untouched defaults (all four switches off):`);
  for (const r of rows) console.log(`  ${r.id}  (business ${r.businessId})  newBookingAlerts=false cancellationAlerts=false`);
  console.log('');

  const statements = [
    {
      label: 'new rows default to alerts on',
      sql: `ALTER TABLE ${TABLE} ALTER COLUMN ${NEW_BOOKING} SET DEFAULT true, ALTER COLUMN ${CANCELLATION} SET DEFAULT true;`,
    },
    {
      label: 'turn alerts on for untouched rows',
      sql: `UPDATE ${TABLE} SET ${NEW_BOOKING} = true, ${CANCELLATION} = true WHERE ${untouchedWhere};`,
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
  console.error('Script failed:', err);
  process.exit(1);
});
