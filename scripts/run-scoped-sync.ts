import { connectDB, disconnectDB } from '../src/config/database';

async function run() {
  await connectDB();
  await disconnectDB();
  process.exit(0);
}

run().catch((err) => {
  console.error('Scoped sync failed:', err);
  process.exit(1);
});
