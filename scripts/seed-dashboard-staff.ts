import 'dotenv/config';
import { AppDataSource } from '../src/config/database';
import { Business } from '../src/business/entities/business.entity';
import { Staff } from '../src/business/entities/staff.entity';
import { Service } from '../src/business/entities/service.entity';
import { BusinessStaffRole } from '../src/middleware/business-staff-role.enum';

// Seeds Staff rows directly (skips the real addStaff() flow, which creates a
// linked User account and sends a real welcome email per staff member --
// unnecessary for populating dashboard lists). A few seeded services get
// assigned to the stylists so the Services <-> Staff relation has real data
// too. Idempotent by staff email.
const MERCHANT_EMAIL = 'proiquovizoiho-6823@yopmail.com';

const STAFF: Array<{
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  gender: string;
  dob: string;
  jobTitle: string;
  role: BusinessStaffRole;
  specialization: string;
  experienceYears: number;
  employmentType: string;
  startDate: string;
  serviceNames: string[];
}> = [
  {
    firstName: 'Adaeze',
    lastName: 'Nwankwo',
    email: 'staff-adaeze@omosalon-seed.test',
    phoneNumber: '+2348012345001',
    gender: 'FEMALE',
    dob: '1994-03-11',
    jobTitle: 'Senior Stylist',
    role: BusinessStaffRole.STYLIST,
    specialization: 'Braiding & Natural Hair',
    experienceYears: 7,
    employmentType: 'full-time',
    startDate: '2023-02-01',
    serviceNames: ['Knotless Box Braids', 'Deep Moisture Treatment'],
  },
  {
    firstName: 'Michael',
    lastName: 'Osei',
    email: 'staff-michael@omosalon-seed.test',
    phoneNumber: '+2348012345002',
    gender: 'MALE',
    dob: '1991-07-22',
    jobTitle: 'Color Specialist',
    role: BusinessStaffRole.STYLIST,
    specialization: 'Color & Balayage',
    experienceYears: 5,
    employmentType: 'full-time',
    startDate: '2023-06-15',
    serviceNames: ['Balayage Color Melt', 'Signature Silk Press'],
  },
  {
    firstName: 'Funmilayo',
    lastName: 'Adeyemi',
    email: 'staff-funmilayo@omosalon-seed.test',
    phoneNumber: '+2348012345003',
    gender: 'FEMALE',
    dob: '1996-11-02',
    jobTitle: 'Nail Technician',
    role: BusinessStaffRole.STYLIST,
    specialization: 'Nails & Lashes',
    experienceYears: 4,
    employmentType: 'part-time',
    startDate: '2024-01-10',
    serviceNames: ['Classic Gel Manicure', 'Acrylic Full Set', 'Classic Lash Extensions'],
  },
  {
    firstName: 'Grace',
    lastName: 'Ibe',
    email: 'staff-grace@omosalon-seed.test',
    phoneNumber: '+2348012345004',
    gender: 'FEMALE',
    dob: '1989-05-18',
    jobTitle: 'Front Desk Manager',
    role: BusinessStaffRole.MANAGER,
    specialization: 'Client Relations & Scheduling',
    experienceYears: 9,
    employmentType: 'full-time',
    startDate: '2022-09-01',
    serviceNames: [],
  },
  {
    firstName: 'David',
    lastName: 'Okoro',
    email: 'staff-david@omosalon-seed.test',
    phoneNumber: '+2348012345005',
    gender: 'MALE',
    dob: '1998-09-30',
    jobTitle: 'Receptionist',
    role: BusinessStaffRole.RECEPTIONIST,
    specialization: 'Front Desk',
    experienceYears: 2,
    employmentType: 'part-time',
    startDate: '2024-04-20',
    serviceNames: [],
  },
];

async function main() {
  await AppDataSource.initialize();
  console.log('DB connected\n');

  const businessRepo = AppDataSource.getRepository(Business);
  const staffRepo = AppDataSource.getRepository(Staff);
  const serviceRepo = AppDataSource.getRepository(Service);

  const business = await businessRepo.findOne({
    where: { ownerEmail: MERCHANT_EMAIL },
  });
  if (!business) {
    throw new Error(`No business found with ownerEmail=${MERCHANT_EMAIL}`);
  }
  console.log(`Seeding staff for business "${business.businessName}" (${business.id})\n`);

  let created = 0;
  let skipped = 0;

  for (const def of STAFF) {
    const existing = await staffRepo.findOne({ where: { email: def.email } });
    if (existing) {
      console.log(`SKIP  (already exists): ${def.firstName} ${def.lastName}`);
      skipped++;
      continue;
    }

    const staff = staffRepo.create({
      firstName: def.firstName,
      lastName: def.lastName,
      email: def.email,
      phoneNumber: def.phoneNumber,
      gender: def.gender,
      dob: def.dob,
      jobTitle: def.jobTitle,
      role: def.role,
      specialization: def.specialization,
      experienceYears: def.experienceYears,
      isActive: true,
      employmentType: def.employmentType,
      startDate: new Date(def.startDate),
      business,
    });
    const savedStaff = await staffRepo.save(staff);
    console.log(`CREATE: ${def.firstName} ${def.lastName} (${def.jobTitle})`);
    created++;

    for (const serviceName of def.serviceNames) {
      const service = await serviceRepo.findOne({
        where: { name: serviceName, business: { id: business.id } },
        relations: ['business', 'assignedStaff'],
      });
      if (!service) {
        console.log(`  WARN: service "${serviceName}" not found, skipping assignment`);
        continue;
      }
      service.assignedStaff = [...(service.assignedStaff ?? []), savedStaff];
      await serviceRepo.save(service);
      console.log(`  linked to service: ${serviceName}`);
    }
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped} (already existed).`);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
