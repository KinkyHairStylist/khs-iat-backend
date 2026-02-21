import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { typeOrmConfig } from '../src/config/database';

dotenv.config();

const SEED_TAG = '[SEED_MOD]';

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
        activity = EXCLUDED.activity
      RETURNING id
    `,
    [
      email,
      firstName,
      surname,
      '+2348111111111',
      new Date().toISOString(),
    ],
  );

  return result.rows[0].id;
};

const seedModerationData = async () => {
  const client = await connectClient();

  try {
    await client.query('BEGIN');

    const reporterId = await upsertUser(
      client,
      'seed.mod.reporter@khs.local',
      'Nora',
      'Adebayo',
    );

    const reportedId = await upsertUser(
      client,
      'seed.mod.reported@khs.local',
      'Tunde',
      'Okafor',
    );

    await client.query(
      `DELETE FROM flagged_content WHERE preview LIKE $1 OR reason LIKE $2`,
      [`${SEED_TAG}%`, `${SEED_TAG}%`],
    );

    const sampleRows = [
      {
        type: 'Review',
        preview: `${SEED_TAG} Review contains abusive language and needs admin review`,
        reporterId,
        reportedId,
        reporterType: 'User',
        reason: `${SEED_TAG} Inappropriate language`,
        severity: 'High',
        status: 'Pending',
      },
      {
        type: 'Profile',
        preview: `${SEED_TAG} User profile has misleading claims`,
        reporterId: null,
        reportedId,
        reporterType: 'Admin System',
        reason: `${SEED_TAG} Misleading profile information`,
        severity: 'Medium',
        status: 'Under review',
      },
      {
        type: 'Business',
        preview: `${SEED_TAG} Business listing has suspicious certification text`,
        reporterId,
        reportedId,
        reporterType: 'User',
        reason: `${SEED_TAG} False information`,
        severity: 'Low',
        status: 'Approved',
      },
      {
        type: 'Review',
        preview: `${SEED_TAG} Duplicate spam review detected`,
        reporterId: null,
        reportedId,
        reporterType: 'Admin System',
        reason: `${SEED_TAG} Spam content`,
        severity: 'Medium',
        status: 'Rejected',
      },
    ];

    for (const row of sampleRows) {
      await client.query(
        `
          INSERT INTO flagged_content (
            ref,
            type,
            preview,
            "reporterId",
            "reportedId",
            "reporterType",
            reason,
            severity,
            status,
            "createdAt"
          )
          VALUES (
            'PRT-' || FLOOR(100000 + RANDOM() * 900000)::text,
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            NOW() - (RANDOM() * INTERVAL '5 days')
          )
        `,
        [
          row.type,
          row.preview,
          row.reporterId,
          row.reportedId,
          row.reporterType,
          row.reason,
          row.severity,
          row.status,
        ],
      );
    }

    const existingSettings = await client.query<{ id: string }>(
      `SELECT id FROM moderation_settings LIMIT 1`,
    );

    if (existingSettings.rowCount && existingSettings.rows[0]?.id) {
      await client.query(
        `
          UPDATE moderation_settings
          SET
            "bannedWords" = $1,
            "Reviews" = TRUE,
            "UserProfile" = TRUE,
            "businessProfile" = TRUE,
            images = TRUE
          WHERE id = $2
        `,
        [['spam', 'abuse', 'offensive', 'scam'], existingSettings.rows[0].id],
      );
    } else {
      await client.query(
        `
          INSERT INTO moderation_settings (
            "bannedWords",
            "Reviews",
            "UserProfile",
            "businessProfile",
            images
          )
          VALUES ($1, TRUE, TRUE, TRUE, TRUE)
        `,
        [['spam', 'abuse', 'offensive', 'scam']],
      );
    }

    await client.query('COMMIT');

    console.log('✅ Content moderation seed complete');
    console.log(`   Reports seeded: ${sampleRows.length}`);
    console.log('   Moderation settings seeded/updated');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Content moderation seed failed:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
};

seedModerationData();
