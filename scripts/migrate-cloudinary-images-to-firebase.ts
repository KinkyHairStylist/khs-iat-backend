// One-off data migration: every image URL still pointing at Cloudinary gets
// downloaded and re-uploaded to Firebase Storage, and the row is repointed
// at the new URL. The original Cloudinary file is NOT deleted (deliberate —
// reversible, low storage cost, cleanup deferred to a later, separate pass).
//
// Covers every real Cloudinary consumer found in the app: user avatars,
// blog post covers, story images, admin article files, client profile
// photos, and chat attachments.
//
//   dry run:  ts-node --project tsconfig.json ./scripts/migrate-cloudinary-images-to-firebase.ts
//   apply:    ts-node --project tsconfig.json ./scripts/migrate-cloudinary-images-to-firebase.ts --execute
//
// Safe to re-run: dry run always reports the current count of remaining
// Cloudinary URLs per table, and only rows still containing "cloudinary.com"
// are touched.
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const isExecute = process.argv.includes('--execute');

interface Target {
  label: string;
  table: string;
  idColumn: string;
  urlColumn: string;
  // Firebase folder for a given row id. Avatars reuse the exact prefix
  // FirebaseStorageService.uploadBufferReplacing/deleteByPrefix use at
  // request time, so a migrated avatar stays replaceable/deletable the
  // normal way; the rest have no such prefix contract, so any stable,
  // readable folder is fine.
  folder: (id: string) => string;
}

const TARGETS: Target[] = [
  { label: 'user avatars', table: 'user', idColumn: 'id', urlColumn: 'avatarUrl', folder: (id) => `avatars/${id}` },
  { label: 'blog post covers', table: 'blog_posts', idColumn: 'id', urlColumn: 'coverImage', folder: (id) => `KHS/migrated/blog/${id}` },
  { label: 'story images', table: 'stories', idColumn: 'id', urlColumn: 'image', folder: (id) => `KHS/migrated/stories/${id}` },
  { label: 'admin articles', table: 'articles', idColumn: 'id', urlColumn: 'fileUrl', folder: (id) => `KHS/migrated/articles/${id}` },
  { label: 'client profile photos', table: 'clients', idColumn: 'id', urlColumn: 'profileImage', folder: (id) => `KHS/migrated/clients/${id}` },
  { label: 'chat attachments', table: 'chat_messages', idColumn: 'id', urlColumn: 'imageUrl', folder: (id) => `KHS/migrated/chat/${id}` },
];

function initFirebaseBucket() {
  if (getApps().length === 0) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;
    initializeApp({
      credential: cert({
        projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      storageBucket,
    });
  }
  return getStorage().bucket();
}

async function downloadFile(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

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

  const bucket = initFirebaseBucket();

  let totalMigrated = 0;
  let totalFailed = 0;

  for (const target of TARGETS) {
    // TypeORM's DataSource.query() returns the row array directly for a
    // SELECT (unlike node-pg's Client, which wraps it in { rows }).
    const rows: { id: string; url: string }[] = await ds.query(
      `SELECT "${target.idColumn}" AS id, "${target.urlColumn}" AS url
       FROM "${target.table}"
       WHERE "${target.urlColumn}" LIKE '%cloudinary.com%'`,
    );

    console.log(`--- ${target.label} (${target.table}."${target.urlColumn}") ---`);
    console.log(`${rows.length} row(s) still on Cloudinary.`);

    if (!isExecute || rows.length === 0) {
      if (!isExecute) console.log('(dry run, not applied)\n');
      else console.log('nothing to do\n');
      continue;
    }

    let tableFailed = 0;
    for (const row of rows) {
      try {
        const { buffer, contentType } = await downloadFile(row.url);
        const extension = contentType.split('/')[1]?.split('+')[0] || 'jpg';
        const fileName = `${target.folder(row.id)}/${uuidv4()}.${extension}`;
        const bucketFile = bucket.file(fileName);
        await bucketFile.save(buffer, { public: true, metadata: { contentType } });
        const imageUrl = bucketFile.publicUrl();

        await ds.query(
          `UPDATE "${target.table}" SET "${target.urlColumn}" = $1 WHERE "${target.idColumn}" = $2`,
          [imageUrl, row.id],
        );
        totalMigrated += 1;
      } catch (error: any) {
        tableFailed += 1;
        totalFailed += 1;
        console.error(`  FAILED row ${row.id}: ${error.message}`);
      }
    }
    console.log(`Migrated ${rows.length - tableFailed} of ${rows.length} for this table.\n`);
  }

  console.log(`Done. ${totalMigrated} migrated, ${totalFailed} failed. Original Cloudinary files were left in place.`);
  await ds.destroy();
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
