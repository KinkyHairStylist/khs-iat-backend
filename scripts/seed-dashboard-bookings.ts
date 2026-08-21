import 'dotenv/config';
import { AppDataSource } from '../src/config/database';
import { Business } from '../src/business/entities/business.entity';
import { Service } from '../src/business/entities/service.entity';
import { Staff } from '../src/business/entities/staff.entity';
import { User } from '../src/all_user_entities/user.entity';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
} from '../src/business/entities/appointment.entity';

// Seeds Appointment rows for the merchant's business. Appointment.client is a
// ManyToOne(User) (NOT the ClientSchema/"clients" CRM table seeded in step 3
// -- bookings are made by real platform customer accounts), so this first
// upserts a handful of customer Users, then creates appointments against the
// services/staff seeded in steps 1-2. Idempotent by orderId.
const MERCHANT_EMAIL = 'proiquovizoiho-6823@yopmail.com';

const CUSTOMERS: Array<{
  firstName: string;
  surname: string;
  email: string;
  phoneNumber: string;
  gender: string;
}> = [
  { firstName: 'Amara', surname: 'Chukwu', email: 'customer-amara@omosalon-seed.test', phoneNumber: '+2348011112222', gender: 'FEMALE' },
  { firstName: 'Tobenna', surname: 'Eze', email: 'customer-tobenna@omosalon-seed.test', phoneNumber: '+2348022223333', gender: 'MALE' },
  { firstName: 'Zainab', surname: 'Bello', email: 'customer-zainab@omosalon-seed.test', phoneNumber: '+2348033334444', gender: 'FEMALE' },
  { firstName: 'Folake', surname: 'Adebayo', email: 'customer-folake@omosalon-seed.test', phoneNumber: '+2348044445555', gender: 'FEMALE' },
];

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

function displayTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

async function main() {
  await AppDataSource.initialize();
  console.log('DB connected\n');

  const userRepo = AppDataSource.getRepository(User);
  const businessRepo = AppDataSource.getRepository(Business);
  const serviceRepo = AppDataSource.getRepository(Service);
  const staffRepo = AppDataSource.getRepository(Staff);
  const appointmentRepo = AppDataSource.getRepository(Appointment);

  const business = await businessRepo.findOne({ where: { ownerEmail: MERCHANT_EMAIL } });
  if (!business) throw new Error(`No business found with ownerEmail=${MERCHANT_EMAIL}`);
  console.log(`Seeding bookings for business "${business.businessName}" (${business.id})\n`);

  // 1. Upsert customer Users
  const customerUsers: User[] = [];
  for (const c of CUSTOMERS) {
    let user = await userRepo.findOne({ where: { email: c.email } });
    if (!user) {
      user = userRepo.create({
        firstName: c.firstName,
        surname: c.surname,
        email: c.email,
        phoneNumber: c.phoneNumber,
        gender: c.gender as any,
        isVerified: true,
        isCustomer: true,
        isMerchant: false,
        isStaff: false,
      });
      user = await userRepo.save(user);
      console.log(`CREATE customer: ${c.firstName} ${c.surname}`);
    } else {
      console.log(`SKIP customer (already exists): ${c.firstName} ${c.surname}`);
    }
    customerUsers.push(user);
  }

  // 2. Load services and staff created in earlier steps
  const services = await serviceRepo.find({ where: { business: { id: business.id } }, relations: ['business'] });
  const staffList = await staffRepo.find({ where: { business: { id: business.id } } });

  if (services.length === 0) throw new Error('No services found -- run seed-dashboard-services.ts first');
  if (staffList.length === 0) throw new Error('No staff found -- run seed-dashboard-staff.ts first');

  const byServiceName = (name: string) => services.find((s) => s.name === name)!;
  const byStaffEmail = (email: string) => staffList.find((s) => s.email === email)!;

  const stylist1 = byStaffEmail('staff-adaeze@omosalon-seed.test');
  const stylist2 = byStaffEmail('staff-michael@omosalon-seed.test');
  const stylist3 = byStaffEmail('staff-funmilayo@omosalon-seed.test');

  type Def = {
    orderId: string;
    customer: User;
    service: Service;
    staff: Staff[];
    dayOffset: number;
    hour: number;
    minute: number;
    status: AppointmentStatus;
    paymentStatus: PaymentStatus;
    specialRequests?: string;
    cancellationsNote?: string;
  };

  const defs: Def[] = [
    {
      orderId: 'SEED-DASH-BK-001',
      customer: customerUsers[0],
      service: byServiceName('Knotless Box Braids'),
      staff: [stylist1],
      dayOffset: -14,
      hour: 10,
      minute: 0,
      status: AppointmentStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
    },
    {
      orderId: 'SEED-DASH-BK-002',
      customer: customerUsers[1],
      service: byServiceName('Balayage Color Melt'),
      staff: [stylist2],
      dayOffset: -7,
      hour: 13,
      minute: 30,
      status: AppointmentStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
    },
    {
      orderId: 'SEED-DASH-BK-003',
      customer: customerUsers[2],
      service: byServiceName('Classic Gel Manicure'),
      staff: [stylist3],
      dayOffset: -2,
      hour: 11,
      minute: 0,
      status: AppointmentStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
    },
    {
      orderId: 'SEED-DASH-BK-004',
      customer: customerUsers[3],
      service: byServiceName('Signature Silk Press'),
      staff: [stylist2],
      dayOffset: 0,
      hour: 15,
      minute: 0,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
    },
    {
      orderId: 'SEED-DASH-BK-005',
      customer: customerUsers[0],
      service: byServiceName('Classic Lash Extensions'),
      staff: [stylist3],
      dayOffset: 3,
      hour: 9,
      minute: 30,
      status: AppointmentStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
    },
    {
      orderId: 'SEED-DASH-BK-006',
      customer: customerUsers[1],
      service: byServiceName('Bridal Glam Makeup'),
      staff: [stylist1, stylist3],
      dayOffset: 6,
      hour: 12,
      minute: 0,
      status: AppointmentStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
    },
    {
      orderId: 'SEED-DASH-BK-007',
      customer: customerUsers[2],
      service: byServiceName('Deep Moisture Treatment'),
      staff: [stylist1],
      dayOffset: 10,
      hour: 14,
      minute: 0,
      status: AppointmentStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
    },
    {
      orderId: 'SEED-DASH-BK-008',
      customer: customerUsers[3],
      service: byServiceName('Hydrating Facial'),
      staff: [stylist3],
      dayOffset: -5,
      hour: 16,
      minute: 0,
      status: AppointmentStatus.CANCELLED,
      paymentStatus: PaymentStatus.UNPAID,
      cancellationsNote: 'Client requested cancellation due to scheduling conflict.',
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const def of defs) {
    const existing = await appointmentRepo.findOne({ where: { orderId: def.orderId } });
    if (existing) {
      console.log(`SKIP  (already exists): ${def.orderId}`);
      skipped++;
      continue;
    }

    const price = def.service.price ?? def.service.minPrice ?? 0;

    const appointment = appointmentRepo.create({
      client: def.customer,
      business,
      service: def.service,
      staff: def.staff,
      orderId: def.orderId,
      serviceName: def.service.name,
      date: isoDate(def.dayOffset),
      time: displayTime(def.hour, def.minute),
      duration: def.service.duration ?? '60 min',
      status: def.status,
      amount: Number(price),
      paymentStatus: def.paymentStatus,
      specialRequests: def.specialRequests,
      cancellationsNote: def.cancellationsNote,
      timeline: [
        {
          actor: 'system',
          action: `${def.status} appointment seeded`,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    await appointmentRepo.save(appointment);
    console.log(`CREATE: ${def.orderId} — ${def.service.name} (${def.status})`);
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
