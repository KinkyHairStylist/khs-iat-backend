import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { typeOrmConfig } from '../src/config/database';

dotenv.config();

const SEED_PASSWORD = 'Password123';
const SEED_TAG = '[SEED_APPT]';
const BUSINESS_NAME = 'KHS Seed Salon Appointment Hub';

type SeedUser = {
  email: string;
  firstName: string;
  surname: string;
  phoneNumber: string;
  isMerchant?: boolean;
  isCustomer?: boolean;
  password: string;
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const toDisplayTime = (date: Date) =>
  date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

const shiftDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const shiftHours = (date: Date, hours: number, minutes = 0) => {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
};

const connectClient = async () => {
  const config = typeOrmConfig as {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl?: object;
  };

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl || false,
  });

  await client.connect();
  return client;
};

const upsertUser = async (client: Client, user: SeedUser): Promise<string> => {
  const nowIso = new Date().toISOString();
  const hashedPassword = await bcrypt.hash(user.password, 10);

  const result = await client.query<{ id: string }>(
    `
      INSERT INTO "user" (
        email,
        "firstName",
        surname,
        "phoneNumber",
        password,
        "isVerified",
        "isMerchant",
        "isCustomer",
        activity
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8)
      ON CONFLICT (email)
      DO UPDATE SET
        "firstName" = EXCLUDED."firstName",
        surname = EXCLUDED.surname,
        "phoneNumber" = EXCLUDED."phoneNumber",
        password = EXCLUDED.password,
        "isMerchant" = EXCLUDED."isMerchant",
        "isCustomer" = EXCLUDED."isCustomer"
      RETURNING id
    `,
    [
      user.email,
      user.firstName,
      user.surname,
      user.phoneNumber,
      hashedPassword,
      user.isMerchant ?? false,
      user.isCustomer ?? true,
      nowIso,
    ],
  );

  return result.rows[0].id;
};

const upsertBusiness = async (
  client: Client,
  ownerId: string,
): Promise<string> => {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM businesses WHERE "businessName" = $1 LIMIT 1`,
    [BUSINESS_NAME],
  );

  if (existing.rowCount && existing.rows[0]?.id) {
    await client.query(
      `
        UPDATE businesses
        SET
          "owner_id" = $2,
          "ownerName" = $3,
          "ownerEmail" = $4,
          "ownerPhone" = $5,
          status = 'approved',
          plan = 'Enterprise',
          revenue = 152500,
          bookings = 278,
          "businessAddress" = $6,
          "primaryAudience" = $7,
          "companySize" = 'multi-staff'
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        ownerId,
        'Ifeanyi Gold',
        'gold.owner@khs-seed.local',
        '+2348012345000',
        'Lekki Phase 1, Lagos, Nigeria',
        'Women and Men',
      ],
    );

    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO businesses (
        "businessName",
        description,
        "owner_id",
        "ownerName",
        "ownerEmail",
        "ownerPhone",
        "primaryAudience",
        service,
        category,
        "businessAddress",
        longitude,
        latitude,
        "companySize",
        "howDidYouHear",
        status,
        revenue,
        bookings,
        plan,
        performance
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10,
        $11,
        $12,
        'multi-staff',
        $13,
        'approved',
        152500,
        278,
        'Enterprise',
        $14::jsonb
      )
      RETURNING id
    `,
    [
      BUSINESS_NAME,
      'Seeded business for appointment management QA scenarios',
      ownerId,
      'Ifeanyi Gold',
      'gold.owner@khs-seed.local',
      '+2348012345000',
      'Women and Men',
      ['Braids', 'Silk Press', 'Loc Retwist', 'Haircut'],
      JSON.stringify(['hair-services']),
      'Lekki Phase 1, Lagos, Nigeria',
      3.4812,
      6.4474,
      ['Admin dashboard'],
      JSON.stringify({
        rating: 4.8,
        reviews: 126,
        completionRate: 97,
        avgResponseMins: 6,
      }),
    ],
  );

  return inserted.rows[0].id;
};

const upsertStaff = async (
  client: Client,
  businessId: string,
  email: string,
  firstName: string,
  lastName: string,
): Promise<string> => {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO staff (
        "firstName",
        "lastName",
        email,
        "phoneNumber",
        role,
        "jobTitle",
        specialization,
        "business_id"
      )
      VALUES ($1, $2, $3, $4, 'HAIRSTYLIST', $5, $6, $7)
      ON CONFLICT (email)
      DO UPDATE SET
        "firstName" = EXCLUDED."firstName",
        "lastName" = EXCLUDED."lastName",
        "phoneNumber" = EXCLUDED."phoneNumber",
        "jobTitle" = EXCLUDED."jobTitle",
        specialization = EXCLUDED.specialization,
        "business_id" = EXCLUDED."business_id"
      RETURNING id
    `,
    [
      firstName,
      lastName,
      email,
      '+2348090000000',
      'Senior Stylist',
      'Protective Styling',
      businessId,
    ],
  );

  return result.rows[0].id;
};

const upsertService = async (client: Client, businessId: string): Promise<string> => {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM "Service" WHERE name = $1 AND "businessId" = $2 LIMIT 1`,
    ['Signature Knotless Braids', businessId],
  );

  if (existing.rowCount && existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO "Service" (
        name,
        category,
        "serviceType",
        description,
        price,
        duration,
        "businessId"
      )
      VALUES ($1, 'hair-services', 'braiding', $2, $3, $4, $5)
      RETURNING id
    `,
    [
      'Signature Knotless Braids',
      'Seeded premium braiding service for appointment testing',
      320,
      '180 min',
      businessId,
    ],
  );

  return inserted.rows[0].id;
};

const clearPreviousSeedAppointments = async (client: Client) => {
  const appointmentIds = await client.query<{ id: string }>(
    `SELECT id FROM appointments WHERE "specialRequests" LIKE $1`,
    [`${SEED_TAG}%`],
  );

  if (!appointmentIds.rowCount) {
    return 0;
  }

  const ids = appointmentIds.rows.map((row) => row.id);

  await client.query(
    `DELETE FROM appointment_staff WHERE appointment_id = ANY($1::uuid[])`,
    [ids],
  );
  await client.query(
    `DELETE FROM appointments WHERE id = ANY($1::uuid[])`,
    [ids],
  );

  return ids.length;
};

const seedAppointments = async () => {
  const client = await connectClient();

  try {
    console.log('📡 Connected to DB. Starting appointment seed...');
    await client.query('BEGIN');

    const ownerId = await upsertUser(client, {
      email: 'alt.rl-61irtmx@yopmail.com',
      firstName: 'Ifeanyi',
      surname: 'Gold',
      phoneNumber: '+2348012345000',
      isMerchant: true,
      isCustomer: false,
      password: SEED_PASSWORD,
    });

    const clientUsers: SeedUser[] = [
      {
        email: 'alt.dk-64090mj@yopmail.com',
        firstName: 'Ada',
        surname: 'Okafor',
        phoneNumber: '+2348100000001',
        password: SEED_PASSWORD,
      },
      {
        email: 'client.two@khs-seed.local',
        firstName: 'Tolu',
        surname: 'Adebayo',
        phoneNumber: '+2348100000002',
        password: SEED_PASSWORD,
      },
      {
        email: 'client.three@khs-seed.local',
        firstName: 'Mina',
        surname: 'Ibrahim',
        phoneNumber: '+2348100000003',
        password: SEED_PASSWORD,
      },
      {
        email: 'client.four@khs-seed.local',
        firstName: 'Zoe',
        surname: 'Campbell',
        phoneNumber: '+2348100000004',
        password: SEED_PASSWORD,
      },
    ];

    const clientIds: string[] = [];
    for (const user of clientUsers) {
      const id = await upsertUser(client, user);
      clientIds.push(id);
    }

    const businessId = await upsertBusiness(client, ownerId);
    const serviceId = await upsertService(client, businessId);

    const staffOneId = await upsertStaff(
      client,
      businessId,
      'staff.one@khs-seed.local',
      'Sade',
      'Johnson',
    );
    const staffTwoId = await upsertStaff(
      client,
      businessId,
      'staff.two@khs-seed.local',
      'Ken',
      'Mensah',
    );

    const removed = await clearPreviousSeedAppointments(client);
    if (removed > 0) {
      console.log(`🧹 Removed ${removed} previous seeded appointments`);
    }

    const appointmentTemplates = [
      { dayOffset: -6, hour: 10, minute: 0, status: 'Completed', paid: 'Paid' },
      { dayOffset: -4, hour: 14, minute: 30, status: 'Completed', paid: 'Paid' },
      { dayOffset: -2, hour: 9, minute: 0, status: 'Cancelled', paid: 'Unpaid' },
      { dayOffset: -1, hour: 16, minute: 0, status: 'Rescheduled', paid: 'Paid' },
      { dayOffset: 0, hour: 11, minute: 30, status: 'Confirmed', paid: 'Paid' },
      { dayOffset: 0, hour: 15, minute: 0, status: 'Pending', paid: 'Unpaid' },
      { dayOffset: 1, hour: 10, minute: 0, status: 'Confirmed', paid: 'Paid' },
      { dayOffset: 1, hour: 13, minute: 30, status: 'Pending', paid: 'Unpaid' },
      { dayOffset: 2, hour: 9, minute: 30, status: 'Pending', paid: 'Unpaid' },
      { dayOffset: 3, hour: 12, minute: 0, status: 'Confirmed', paid: 'Paid' },
      { dayOffset: 5, hour: 11, minute: 0, status: 'Pending', paid: 'Unpaid' },
      { dayOffset: 7, hour: 14, minute: 0, status: 'Confirmed', paid: 'Paid' },
    ] as const;

    let created = 0;
    for (let index = 0; index < appointmentTemplates.length; index++) {
      const template = appointmentTemplates[index];
      const baseDate = shiftDays(template.dayOffset);
      const slot = shiftHours(baseDate, template.hour, template.minute);
      const clientId = clientIds[index % clientIds.length];
      const orderId = `SEED-BK-${String(index + 1).padStart(3, '0')}`;
      const timeline = [
        {
          actor: 'system',
          action: `${template.status} appointment seeded`,
          timestamp: new Date().toISOString(),
        },
      ];

      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO appointments (
            "client_id",
            "business_id",
            "orderId",
            "serviceName",
            date,
            time,
            duration,
            status,
            amount,
            "paymentStatus",
            "specialRequests",
            "cancellationsNote",
            timeline,
            "service_id"
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13::jsonb,
            $14
          )
          RETURNING id
        `,
        [
          clientId,
          businessId,
          orderId,
          'Signature Knotless Braids',
          toIsoDate(slot),
          toDisplayTime(slot),
          '180 min',
          template.status,
          template.status === 'Completed' ? 320 : 280,
          template.paid,
          `${SEED_TAG} Appointment management scenario #${index + 1}`,
          template.status === 'Cancelled'
            ? `${SEED_TAG} Client requested cancellation for conflict`
            : null,
          JSON.stringify(timeline),
          serviceId,
        ],
      );

      const staffForAppointment =
        index % 2 === 0 ? [staffOneId] : [staffOneId, staffTwoId];

      for (const staffId of staffForAppointment) {
        await client.query(
          `
            INSERT INTO appointment_staff (appointment_id, staff_id)
            VALUES ($1, $2)
          `,
          [inserted.rows[0].id, staffId],
        );
      }

      created += 1;
    }

    await client.query('COMMIT');
    console.log('✅ Appointment management seed completed successfully');
    console.log(`   • Business: ${BUSINESS_NAME}`);
    console.log(`   • Seeded appointments: ${created}`);
    console.log(`   • Seed marker: ${SEED_TAG}`);
    console.log(`   • Default password for all users: ${SEED_PASSWORD}`);
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Failed to seed appointment management data:', message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
};

seedAppointments();