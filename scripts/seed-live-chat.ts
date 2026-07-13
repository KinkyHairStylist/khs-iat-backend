import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { typeOrmConfig } from '../src/config/database';

dotenv.config();

const SEED_TAG = '[SEED_CHAT]';

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

const upsertClientUser = async (
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
      '+2348222222222',
      new Date().toISOString(),
    ],
  );

  return result.rows[0].id;
};

const seedLiveChat = async () => {
  const client = await connectClient();

  try {
    await client.query('BEGIN');

    const adminUsers = await client.query<{ id: string }>(
      `
      SELECT id
      FROM "user"
      WHERE "isAdmin" = TRUE OR "isSuperAdmin" = TRUE
      ORDER BY "createdAt" ASC
      `,
    );

    let adminIds = adminUsers.rows.map((row) => row.id);

    if (!adminIds.length) {
      const fallbackAdmin = await client.query<{ id: string }>(
        `
          INSERT INTO "user" (
            email,
            "firstName",
            surname,
            "phoneNumber",
            "isVerified",
            "isAdmin",
            "isClient",
            "isBusiness",
            activity
          )
          VALUES (
            'seed.chat.admin@khs.local',
            'Support',
            'Admin',
            '+2348333333333',
            TRUE,
            TRUE,
            FALSE,
            FALSE,
            $1
          )
          ON CONFLICT (email)
          DO UPDATE SET
            "isAdmin" = TRUE,
            "isVerified" = TRUE,
            activity = EXCLUDED.activity
          RETURNING id
        `,
        [new Date().toISOString()],
      );

      adminIds = [fallbackAdmin.rows[0].id];
    }

    const clientUsers = [
      {
        email: 'seed.chat.client1@khs.local',
        firstName: 'Ada',
        surname: 'Williams',
      },
      {
        email: 'seed.chat.client2@khs.local',
        firstName: 'Victor',
        surname: 'Stone',
      },
      {
        email: 'seed.chat.client3@khs.local',
        firstName: 'Kemi',
        surname: 'Lawal',
      },
    ];

    const seededClientIds: string[] = [];
    for (const user of clientUsers) {
      const id = await upsertClientUser(client, user.email, user.firstName, user.surname);
      seededClientIds.push(id);
    }

    await client.query(
      `DELETE FROM chat_messages WHERE message LIKE $1`,
      [`${SEED_TAG}%`],
    );

    for (const adminId of adminIds) {
      for (let index = 0; index < seededClientIds.length; index += 1) {
        const clientId = seededClientIds[index];

        await client.query(
          `
            INSERT INTO chat_messages ("senderId", "receiverId", message, read, "createdAt")
            VALUES
              ($1, $2, $3, FALSE, NOW() - INTERVAL '20 minutes'),
              ($2, $1, $4, FALSE, NOW() - INTERVAL '18 minutes'),
              ($1, $2, $5, TRUE, NOW() - INTERVAL '15 minutes')
          `,
          [
            clientId,
            adminId,
            `${SEED_TAG} Hi admin, I need help with my booking #${index + 1}.`,
            `${SEED_TAG} Sure, I can help. Could you share your appointment ID?`,
            `${SEED_TAG} Yes, it is APT-SEED-${index + 100}.`,
          ],
        );
      }
    }

    const onlineUserIds = [adminIds[0], seededClientIds[0], seededClientIds[1]].filter(Boolean);

    for (const userId of onlineUserIds) {
      await client.query(
        `
          INSERT INTO user_status ("userId", "isOnline")
          VALUES ($1, TRUE)
          ON CONFLICT ("userId")
          DO UPDATE SET "isOnline" = EXCLUDED."isOnline"
        `,
        [userId],
      );
    }

    await client.query('COMMIT');

    console.log('✅ Live chat seed complete');
    console.log(`   Admin users seeded: ${adminIds.length}`);
    console.log(`   Client users seeded: ${seededClientIds.length}`);
    console.log(`   Conversations/messages seeded for testing with tag ${SEED_TAG}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Live chat seed failed:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
};

seedLiveChat();
