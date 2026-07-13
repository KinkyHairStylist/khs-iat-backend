import { memoryStorage } from 'multer';
import { extname } from 'path';
import type { Options as MulterOptions } from 'multer';

export const fileUploadOptions = (): MulterOptions => ({
  storage: memoryStorage(),
  fileFilter: (req, file, callback: any) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf', '.docx'];
    const ext = extname(file.originalname).toLowerCase();

    if (!allowed.includes(ext)) {
      // Use a plain Error to satisfy Multer typings
      return callback(
        new Error('Invalid file type. Allowed: jpg, png, pdf, docx'),
        false,
      );
    }

    callback(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
});
