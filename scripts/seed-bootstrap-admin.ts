import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { User } from '../src/all_user_entities/user.entity';

dotenv.config();

const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@local.test';
const ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'ChangeMe123!';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [__dirname + '/../src/**/*.entity.ts'],
    synchronize: false,
  });

  await dataSource.initialize();
  const usersRepo = dataSource.getRepository(User);

  const existing = await usersRepo.findOne({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log(`Admin already exists: ${ADMIN_EMAIL} (id: ${existing.id})`);
    await dataSource.destroy();
    return;
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = usersRepo.create({
    email: ADMIN_EMAIL,
    password: hash,
    firstName: 'Bootstrap',
    surname: 'Admin',
    isVerified: true,
    isSuperAdmin: true,
    isAdmin: true,
    isBusiness: false,
    isClient: false,
    isManager: false,
    isBusinessAdmin: false,
  } as any);

  await usersRepo.save(admin);

  console.log('Bootstrap admin created:');
  console.log(`   email:    ${ADMIN_EMAIL}`);
  console.log(`   password: ${ADMIN_PASSWORD}`);
}

main().catch((err) => {
  console.error('Failed to create bootstrap admin:', err);
  process.exit(1);
});