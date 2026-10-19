import { AppError } from "../../middlewares/centralAppError";
import { sniffImageType } from "../../middlewares/imageUpload";
import { uploadChatImage } from "../../lib/firebase/storage";

// Same limit as staff replies (khs-iat-staff-be). The JSON body limit for the
// send route (app.ts) allows for the base64 overhead.
export const MAX_CHAT_IMAGE_BYTES = 1024 * 1024;

/**
 * "data:image/png;base64,..." (or bare base64) → a public image URL. The type
 * is decided by the bytes, so a renamed file can't be stored as an image.
 */
export async function storeChatImage(imageBase64: string): Promise<string> {
  const match = /^data:[^;,]+;base64,(.*)$/s.exec(imageBase64);
  const buffer = Buffer.from(match ? match[1] : imageBase64, "base64");
  if (buffer.length === 0) throw AppError.badRequest("We couldn't read that image. Please choose it again.", "INVALID_IMAGE");
  if (buffer.length > MAX_CHAT_IMAGE_BYTES) throw new AppError("Please choose an image smaller than 1 MB.", 413, "FILE_TOO_LARGE");
  const mimeType = sniffImageType(buffer);
  if (!mimeType) throw AppError.badRequest("Only JPG, PNG or WebP images can be sent.", "UNSUPPORTED_IMAGE");
  return (await uploadChatImage(buffer, mimeType)).url;
}
