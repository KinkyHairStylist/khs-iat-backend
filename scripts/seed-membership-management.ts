import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { typeOrmConfig } from '../src/config/database';

dotenv.config();

const SEED_TAG = '[SEED_MEM]';

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

const upsertUser = async (
  client: Client,
  email: string,
  firstName: string,
  surname: string,
): Promise<string> => {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO "user" (
        email,
        "firstName",
        surname,
        "phoneNumber",
        "isVerified",
        "isClient",
        "isBusiness",
        activity
      )
      VALUES ($1, $2, $3, $4, TRUE, TRUE, FALSE, $5)
      ON CONFLICT (email)
      DO UPDATE SET
        "firstName" = EXCLUDED."firstName",
        surname = EXCLUDED.surname,
        "isVerified" = TRUE,
        "isClient" = TRUE,
        "isBusiness" = FALSE,
        activity = EXCLUDED.activity
      RETURNING id
    `,
    [
      email,
      firstName,
      surname,
      '+2348000000000',
      new Date().toISOString(),
    ],
  );

  return result.rows[0].id;
};

const seedMembershipData = async () => {
  const client = await connectClient();

  try {
    await client.query('BEGIN');

    const existingPlanIds = await client.query<{ id: string }>(
      `SELECT id FROM membership_plan WHERE name LIKE $1`,
      [`${SEED_TAG}%`],
    );

    if (existingPlanIds.rowCount) {
      await client.query(
        `DELETE FROM subscription WHERE "planId" = ANY($1::uuid[])`,
        [existingPlanIds.rows.map((row) => row.id)],
      );
      await client.query(
        `DELETE FROM membership_plan WHERE id = ANY($1::uuid[])`,
        [existingPlanIds.rows.map((row) => row.id)],
      );
    }

    const plans = [
      {
        name: `${SEED_TAG} Bronze Care`,
        tier: 'Bronze',
        price: 49.99,
        saving: 10,
        sessions: 2,
        features: ['Priority booking', '2 monthly sessions', 'Email support'],
        isPopular: false,
        activeSubscribers: 8,
        description: 'Bronze seed plan for admin membership testing',
      },
      {
        name: `${SEED_TAG} Gold Glow`,
        tier: 'Gold',
        price: 89.99,
        saving: 22,
        sessions: 4,
        features: [
          'Priority booking',
          '4 monthly sessions',
          'Phone support',
          'Loyalty bonus',
        ],
        isPopular: true,
        activeSubscribers: 14,
        description: 'Gold seed plan for admin membership testing',
      },
      {
        name: `${SEED_TAG} Platinum Luxe`,
        tier: 'Platinum',
        price: 149.99,
        saving: 40,
        sessions: 8,
        features: [
          'VIP support',
          '8 monthly sessions',
          'Dedicated stylist',
          'Exclusive offers',
        ],
        isPopular: false,
        activeSubscribers: 5,
        description: 'Platinum seed plan for admin membership testing',
      },
    ];

    const seededPlanIds: string[] = [];

    for (const plan of plans) {
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO membership_plan (
            name,
            tier,
            price,
            saving,
            sessions,
            features,
            "isPopular",
            "activeSubscribers",
            description,
            "billingCycle",
            "isActive"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'MONTHLY', TRUE)
          RETURNING id
        `,
        [
          plan.name,
          plan.tier,
          plan.price,
          plan.saving,
          plan.sessions,
          plan.features.join(','),
          plan.isPopular,
          plan.activeSubscribers,
          plan.description,
        ],
      );

      seededPlanIds.push(inserted.rows[0].id);
    }

    const users = [
      {
        email: 'seed.mem.alex@khs.local',
        firstName: 'Alex',
        surname: 'Brown',
      },
      {
        email: 'seed.mem.maya@khs.local',
        firstName: 'Maya',
        surname: 'Johnson',
      },
      {
        email: 'seed.mem.liam@khs.local',
        firstName: 'Liam',
        surname: 'Scott',
      },
    ];

    const userIds: string[] = [];
    for (const user of users) {
      const id = await upsertUser(client, user.email, user.firstName, user.surname);
      userIds.push(id);
    }

    await client.query(
      `
        DELETE FROM subscription
        WHERE "userId" = ANY($1::uuid[])
      `,
      [userIds],
    );

    const subscriptionRows = [
      {
        userId: userIds[0],
        planId: seededPlanIds[0],
        duration: 30,
        status: 'Active',
      },
      {
        userId: userIds[1],
        planId: seededPlanIds[1],
        duration: 30,
        status: 'Active',
      },
      {
        userId: userIds[2],
        planId: seededPlanIds[2],
        duration: 30,
        status: 'Cancelled',
      },
    ];

    for (const row of subscriptionRows) {
      await client.query(
        `
          INSERT INTO subscription (
            "userId",
            "planId",
            duration,
            "startDate",
            "nextBilling",
            status
          )
          VALUES (
            $1,
            $2,
            $3,
            NOW() - INTERVAL '10 days',
            NOW() + INTERVAL '20 days',
            $4
          )
        `,
        [row.userId, row.planId, row.duration, row.status],
      );
    }

    await client.query('COMMIT');

    console.log('✅ Membership management seed complete');
    console.log(`   Plans seeded: ${seededPlanIds.length}`);
    console.log(`   Subscribers seeded: ${subscriptionRows.length}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Membership seed failed:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
};

seedMembershipData();
