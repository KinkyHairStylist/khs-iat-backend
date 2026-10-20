import { randomUUID } from "crypto";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import {
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
} from "../../config/env";
import { AppError } from "../../middlewares/centralAppError";
import { getServiceLogger } from "../../utils/loggerCreator";

// The KHS Firebase Storage bucket (shared with the staff backend). Files are
// public and live under KHS/<folder>, same as before.

const logger = getServiceLogger("storage");
const APP_NAME = "khs-customer-storage";

export const storageConfigured = Boolean(FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY);

function app(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  return initializeApp(
    {
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        // .env files usually hold the key on one line with literal \n.
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
      storageBucket: FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.appspot.com`,
    },
    APP_NAME
  );
}

export interface UploadedImage {
  path: string;
  url: string;
}

const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Saves verified image bytes at `path` (public). The name is always generated here. */
async function saveImage(buffer: Buffer, mimeType: string, folderPath: string): Promise<UploadedImage> {
  if (!storageConfigured) {
    throw new AppError("Image uploads aren't set up on this server yet.", 503, "UPLOADS_DISABLED");
  }
  const path = `${folderPath}/${randomUUID()}.${EXTENSION[mimeType] ?? "bin"}`;
  try {
    const file = getStorage(app()).bucket().file(path);
    await file.save(buffer, {
      public: true,
      resumable: false,
      metadata: { contentType: mimeType, cacheControl: "public, max-age=31536000, immutable" },
    });
    return { path, url: file.publicUrl() };
  } catch (err) {
    logger.error("Image upload failed", { path, error: (err as Error).message });
    throw AppError.internal("We couldn't upload the image. Please try again.");
  }
}

/** A support-chat attachment, in the same KHS/chat folder the KHS backend uses. */
export function uploadChatImage(buffer: Buffer, mimeType: string): Promise<UploadedImage> {
  return saveImage(buffer, mimeType, "KHS/chat");
}

const avatarFolder = (userId: string) => `KHS/avatars/${userId}`;

/** Removes every file in a folder except `keepPath`. Best effort: a leftover file only costs storage. */
async function clearFolder(folderPath: string, keepPath?: string): Promise<void> {
  if (!storageConfigured) return;
  try {
    const [files] = await getStorage(app()).bucket().getFiles({ prefix: `${folderPath}/` });
    await Promise.all(files.filter((f) => f.name !== keepPath).map((f) => f.delete({ ignoreNotFound: true })));
  } catch (err) {
    logger.warn("Could not clear an image folder", { folderPath, error: (err as Error).message });
  }
}

/** A customer's profile photo. The previous one is removed once the new one is saved. */
export async function uploadAvatar(userId: string, buffer: Buffer, mimeType: string): Promise<UploadedImage> {
  const image = await saveImage(buffer, mimeType, avatarFolder(userId));
  await clearFolder(avatarFolder(userId), image.path);
  return image;
}

export function deleteAvatarFiles(userId: string): Promise<void> {
  return clearFolder(avatarFolder(userId));
}

/** Folders for a salon's own photos (each salon has its own subfolder). */
export type BusinessImageKind = "serviceImages" | "staffImages" | "clientImages" | "galleryImages";
const businessImageFolder = (kind: BusinessImageKind, businessId: string) => `KHS/${kind}/${businessId}`;

/** A photo for a salon's service or team member, in that salon's own folder. */
export function uploadBusinessImage(kind: BusinessImageKind, businessId: string, buffer: Buffer, mimeType: string): Promise<UploadedImage> {
  return saveImage(buffer, mimeType, businessImageFolder(kind, businessId));
}

// publicUrl() is "<endpoint>/<bucket>/<path with / encoded as %2F>".
const bucketUrlPrefix = () => `https://storage.googleapis.com/${getStorage(app()).bucket().name}/`;

/** The public URL prefix of a salon's photos of a kind, so a record can only point at that salon's own uploads. */
export function businessImageUrlPrefix(kind: BusinessImageKind, businessId: string): string | null {
  if (!storageConfigured) return null;
  return bucketUrlPrefix() + encodeURIComponent(`${businessImageFolder(kind, businessId)}/`);
}

/** Removes photos no longer used. Best effort: a leftover file only costs storage. */
export async function deleteBusinessImages(kind: BusinessImageKind, businessId: string, urls: string[]): Promise<void> {
  const prefix = businessImageUrlPrefix(kind, businessId);
  if (!prefix) return;
  const bucket = getStorage(app()).bucket();
  await Promise.all(
    urls
      .filter((u) => u.startsWith(prefix))
      .map((u) =>
        bucket
          .file(decodeURIComponent(u.slice(bucketUrlPrefix().length)))
          .delete({ ignoreNotFound: true })
          .catch((err: Error) => logger.warn("Could not remove a photo", { url: u, error: err.message })),
      ),
  );
}
