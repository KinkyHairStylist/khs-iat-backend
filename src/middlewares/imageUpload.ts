import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "./centralAppError";

// One image, held in memory (never written to disk), at most 5 MB. The type is
// decided by the file's first bytes, not its name or the browser's claim — so a
// renamed HTML/SVG file can't be stored as an "image" on the public bucket.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 1 },
}).single("file");

/** JPEG, PNG or WebP by magic number; null for anything else. */
export function sniffImageType(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Parses the "file" field and sets req.file; answers 400/413 itself on a bad upload. */
export function imageUpload(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") return next(new AppError("The image is too large. The limit is 5 MB.", 413, "FILE_TOO_LARGE"));
      return next(AppError.badRequest("Send one image in the \"file\" field.", "INVALID_UPLOAD"));
    }
    if (err) return next(AppError.badRequest("We couldn't read that upload. Please try again.", "INVALID_UPLOAD"));
    if (!req.file) return next(AppError.badRequest("Choose an image to upload.", "NO_FILE"));
    const type = sniffImageType(req.file.buffer);
    if (!type) return next(AppError.badRequest("Only JPG, PNG or WebP images can be uploaded.", "UNSUPPORTED_IMAGE"));
    req.file.mimetype = type;
    next();
  });
}
