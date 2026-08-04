import 'dotenv/config';
import { AppDataSource } from '../src/config/database';
import { User } from '../src/all_user_entities/user.entity';
import {
  ClientSchema,
  ClientType,
  ClientSource,
  Pronouns,
} from '../src/business/entities/client.entity';
import { Gender } from '../src/business/types/constants';

// Seeds Client rows (table "clients") owned by the merchant's own User
// account -- clients are scoped to owner_id, not businessId, per the entity.
// Idempotent: the (email, ownerId) pair is unique, so re-running skips
// clients that already exist.
const MERCHANT_EMAIL = 'proiquovizoiho-6823@yopmail.com';

const CLIENTS: Array<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCode: string;
  clientType: ClientType;
  dateOfBirth: string;
  gender: Gender;
  pronouns: Pronouns;
  occupation: string;
  clientSource: ClientSource;
}> = [
  {
    firstName: 'Amara',
    lastName: 'Chukwu',
    email: 'client-amara@omosalon-seed.test',
    phone: '8011112222',
    phoneCode: '+234',
    clientType: ClientType.VIP,
    dateOfBirth: '1995-04-12',
    gender: Gender.FEMALE,
    pronouns: Pronouns.SHE_HER,
    occupation: 'Marketing Manager',
    clientSource: ClientSource.REFERRAL,
  },
  {
    firstName: 'Tobenna',
    lastName: 'Eze',
    email: 'client-tobenna@omosalon-seed.test',
    phone: '8022223333',
    phoneCode: '+234',
    clientType: ClientType.REGULAR,
    dateOfBirth: '1992-11-05',
    gender: Gender.MALE,
    pronouns: Pronouns.HE_HIM,
    occupation: 'Software Engineer',
    clientSource: ClientSource.INSTAGRAM,
  },
  {
    firstName: 'Zainab',
    lastName: 'Bello',
    email: 'client-zainab@omosalon-seed.test',
    phone: '8033334444',
    phoneCode: '+234',
    clientType: ClientType.NEW,
    dateOfBirth: '2000-01-30',
    gender: Gender.FEMALE,
    pronouns: Pronouns.SHE_HER,
    occupation: 'University Student',
    clientSource: ClientSource.FACEBOOK,
  },
  {
    firstName: 'Folake',
    lastName: 'Adebayo',
    email: 'client-folake@omosalon-seed.test',
    phone: '8044445555',
    phoneCode: '+234',
    clientType: ClientType.VIP,
    dateOfBirth: '1993-09-15',
    gender: Gender.FEMALE,
    pronouns: Pronouns.SHE_HER,
    occupation: 'Entrepreneur',
    clientSource: ClientSource.REFERRAL,
  },
  {
    firstName: 'Emeka',
    lastName: 'Nwosu',
    email: 'client-emeka@omosalon-seed.test',
    phone: '8055556666',
    phoneCode: '+234',
    clientType: ClientType.REGULAR,
    dateOfBirth: '1997-03-08',
    gender: Gender.MALE,
    pronouns: Pronouns.HE_HIM,
    occupation: 'Accountant',
    clientSource: ClientSource.WALK_IN,
  },
  {
    firstName: 'Ngozi',
    lastName: 'Okonkwo',
    email: 'client-ngozi@omosalon-seed.test',
    phone: '8066667777',
    phoneCode: '+234',
    clientType: ClientType.NEW,
    dateOfBirth: '2001-08-14',
    gender: Gender.FEMALE,
    pronouns: Pronouns.SHE_HER,
    occupation: 'Nurse',
    clientSource: ClientSource.WEBSITE,
  },
];

async function main() {
  await AppDataSource.initialize();
  console.log('DB connected\n');

  const userRepo = AppDataSource.getRepository(User);
  const clientRepo = AppDataSource.getRepository(ClientSchema);

  const merchant = await userRepo.findOne({ where: { email: MERCHANT_EMAIL } });
  if (!merchant) {
    throw new Error(`No user found with email=${MERCHANT_EMAIL}`);
  }
  console.log(`Seeding clients owned by "${merchant.email}" (${merchant.id})\n`);

  let created = 0;
  let skipped = 0;

  for (const def of CLIENTS) {
    const existing = await clientRepo.findOne({
      where: { email: def.email, ownerId: merchant.id },
    });
    if (existing) {
      console.log(`SKIP  (already exists): ${def.firstName} ${def.lastName}`);
      skipped++;
      continue;
    }

    const client = clientRepo.create({
      firstName: def.firstName,
      lastName: def.lastName,
      email: def.email,
      phone: def.phone,
      phoneCode: def.phoneCode,
      clientType: def.clientType,
      dateOfBirth: def.dateOfBirth,
      gender: def.gender,
      pronouns: def.pronouns,
      occupation: def.occupation,
      clientSource: def.clientSource,
      ownerId: merchant.id,
      isActive: true,
    });
    await clientRepo.save(client);
    console.log(`CREATE: ${def.firstName} ${def.lastName} (${def.clientType})`);
    created++;
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped} (already existed).`);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
