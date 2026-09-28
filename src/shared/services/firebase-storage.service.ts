import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Bucket } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
  imageId: string;
  imageUrl: string;
}

// Shape formidable/multiparty-style form parsers hand back (as opposed to
// Multer's Express.Multer.File, which carries the file in memory as
// `.buffer` instead of a temp filepath on disk).
export interface FileUpload {
  filepath: string;
  mimetype: string;
  originalFilename: string;
  size: number;
}

/**
 * Single shared upload/delete surface over Firebase Storage, used by every
 * part of the app that previously talked to Cloudinary directly (avatars,
 * landing content, admin articles, client images, chat attachments) as well
 * as the business/product image flows that were already on Firebase. One
 * bucket, one set of methods — callers only choose a folderPath.
 */
@Injectable()
export class FirebaseStorageService {
  constructor(
    @Inject('FIREBASE_STORAGE_BUCKET') private readonly bucket: Bucket,
  ) {}

  // Upload from a local temp filepath (multiparty/formidable-style forms).
  async uploadFromFilepath(file: any, folderPath: string): Promise<UploadResult> {
    try {
      const fileName = `${folderPath}/${uuidv4()}_${file.originalFilename}`;
      const [uploadedFile] = await this.bucket.upload(file.filepath, {
        destination: fileName,
        public: true,
        metadata: { contentType: file.mimetype },
      });

      return { imageId: fileName, imageUrl: uploadedFile.publicUrl() };
    } catch (error) {
      console.error('Firebase upload error (filepath):', error);
      throw new InternalServerErrorException('Failed to upload image');
    }
  }

  // Upload from a local temp filepath, replacing whatever was already at
  // this folder prefix (single-slot images like an avatar or profile photo).
  async uploadReplacing(file: any, folderPath: string): Promise<UploadResult> {
    try {
      const [files] = await this.bucket.getFiles({ prefix: folderPath });
      await Promise.all(files.map((f) => f.delete()));
      return this.uploadFromFilepath(file, folderPath);
    } catch (error) {
      console.error('Firebase upload error (replace):', error);
      throw new InternalServerErrorException('Failed to upload image');
    }
  }

  // Upload a base64 data URI (cropper views, chat image attachments). Also
  // accepts a raw base64 payload with no "data:...;base64," prefix, sniffing
  // the mime type from the leading bytes so the stored contentType is still
  // correct.
  async uploadFromBase64(dataUri: string, folderPath: string): Promise<UploadResult> {
    try {
      let mimeType = 'image/png';
      let rawBase64 = dataUri || '';

      const matches = (dataUri || '').match(/^data:([^;]+);base64,(.*)$/s);
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        rawBase64 = matches[2];
      } else {
        mimeType = this.sniffMimeType(rawBase64.trim());
      }

      const cleanBase64 = rawBase64.replace(/[\s"']/g, '');
      if (!cleanBase64) {
        throw new Error('Empty base64 data received');
      }

      const buffer = Buffer.from(cleanBase64, 'base64');
      const fileExtension = mimeType.split('/')[1]?.split('+')[0] || 'png';
      const fileName = `${folderPath}/${uuidv4()}.${fileExtension}`;
      const file = this.bucket.file(fileName);

      await file.save(buffer, { public: true, metadata: { contentType: mimeType } });

      return { imageId: fileName, imageUrl: file.publicUrl() };
    } catch (error: any) {
      console.error('Firebase upload error (base64):', error);
      throw new InternalServerErrorException(error?.message || 'Failed to upload image');
    }
  }

  // Upload a raw in-memory buffer (Multer memoryStorage uploads).
  async uploadFromBuffer(file: Express.Multer.File, folderPath: string): Promise<UploadResult> {
    try {
      const fileName = `${folderPath}/${uuidv4()}_${file.originalname}`;
      const bucketFile = this.bucket.file(fileName);

      await bucketFile.save(file.buffer, {
        public: true,
        metadata: { contentType: file.mimetype },
      });

      return { imageId: fileName, imageUrl: bucketFile.publicUrl() };
    } catch (error) {
      console.error('Firebase upload error (buffer):', error);
      throw new InternalServerErrorException('Failed to upload image');
    }
  }

  // Upload a Multer memory buffer, replacing whatever was already at this
  // folder prefix (single-slot images sourced from a memoryStorage upload,
  // e.g. a user avatar).
  async uploadBufferReplacing(file: Express.Multer.File, folderPath: string): Promise<UploadResult> {
    try {
      const [files] = await this.bucket.getFiles({ prefix: folderPath });
      await Promise.all(files.map((f) => f.delete()));
      return this.uploadFromBuffer(file, folderPath);
    } catch (error) {
      console.error('Firebase upload error (buffer replace):', error);
      throw new InternalServerErrorException('Failed to upload image');
    }
  }

  // Delete every object under a folder prefix (a single-slot image's whole
  // slot, e.g. clearing an avatar or a client's profile photo without
  // uploading a replacement).
  async deleteByPrefix(folderPath: string): Promise<boolean> {
    try {
      const [files] = await this.bucket.getFiles({ prefix: folderPath });
      await Promise.all(files.map((f) => f.delete()));
      return true;
    } catch (error) {
      console.error('Firebase delete error (prefix):', error);
      throw new InternalServerErrorException('Failed to delete image');
    }
  }

  private sniffMimeType(base64: string): string {
    if (base64.startsWith('/9j/')) return 'image/jpeg';
    if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
    if (base64.startsWith('R0lGOD')) return 'image/gif';
    if (base64.startsWith('UklGR')) return 'image/webp';
    return 'image/jpeg';
  }

  // Upload a buffer fetched from elsewhere (used by the Cloudinary → Firebase
  // one-off data migration script — not a normal request-time upload path).
  async uploadFromRemoteBuffer(
    buffer: Buffer,
    contentType: string,
    folderPath: string,
    originalName: string,
  ): Promise<UploadResult> {
    try {
      const fileName = `${folderPath}/${uuidv4()}_${originalName}`;
      const bucketFile = this.bucket.file(fileName);
      await bucketFile.save(buffer, { public: true, metadata: { contentType } });
      return { imageId: fileName, imageUrl: bucketFile.publicUrl() };
    } catch (error) {
      console.error('Firebase upload error (remote buffer):', error);
      throw new InternalServerErrorException('Failed to upload image');
    }
  }

  async deleteImage(imageId: string): Promise<boolean> {
    try {
      await this.bucket.file(imageId).delete();
      return true;
    } catch (error) {
      console.error('Firebase delete error:', error);
      throw new InternalServerErrorException('Failed to delete image');
    }
  }
}
