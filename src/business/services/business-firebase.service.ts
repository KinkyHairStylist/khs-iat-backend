import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Bucket } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

export interface UploadResult {
  imageId: string;
  imageUrl: string;
}

@Injectable()
export class BusinessFirebaseService {
  constructor(
    @Inject('FIREBASE_STORAGE_BUCKET') private readonly bucket: Bucket
  ) {}

  // 1. Upload local temporary filepath (used for multiparty forms)
  async uploadBusinessImage(file: any, folderPath: string): Promise<UploadResult> {
    try {
      const fileName = `${folderPath}/${uuidv4()}_${file.originalFilename}`;
      const [uploadedFile] = await this.bucket.upload(file.filepath, {
        destination: fileName,
        public: true, // Make publicly accessible
        metadata: {
          contentType: file.mimetype,
        },
      });

      return {
        imageId: fileName,
        imageUrl: uploadedFile.publicUrl(),
      };
    } catch (error) {
      console.error('Firebase Upload Error:', error);
      throw new InternalServerErrorException('Failed to upload business image');
    }
  }

  // 2. Upload Profile Image (Replaces previous and deletes old folder resources)
  async uploadImage(file: any, folderPath: string): Promise<UploadResult> {
    try {
      // Delete existing files in that folder prefix
      const [files] = await this.bucket.getFiles({ prefix: folderPath });
      await Promise.all(files.map(f => f.delete()));

      return this.uploadBusinessImage(file, folderPath);
    } catch (error) {
      console.error('Firebase Profile Upload Error:', error);
      throw new InternalServerErrorException('Failed to upload profile image');
    }
  }

  // 3. Upload base64 strings (commonly used for cropper views)
  async uploadImageFromBase64(dataUri: string, folderPath: string): Promise<UploadResult> {
    try {
      const matches = dataUri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error('Invalid Base64 Data URI');
      }

      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      
      const fileExtension = mimeType.split('/')[1] || 'png';
      const fileName = `${folderPath}/${uuidv4()}.${fileExtension}`;
      const file = this.bucket.file(fileName);

      await file.save(buffer, {
        public: true,
        metadata: { contentType: mimeType },
      });

      return {
        imageId: fileName,
        imageUrl: file.publicUrl(),
      };
    } catch (error) {
      console.error('Firebase Base64 Upload Error:', error);
      throw new InternalServerErrorException('Failed to upload image from Base64');
    }
  }

  // 4. Upload raw buffer (used for Multer memory uploads)
  async uploadImageFromBuffer(file: Express.Multer.File, folderPath: string): Promise<UploadResult> {
    try {
      const fileName = `${folderPath}/${uuidv4()}_${file.originalname}`;
      const bucketFile = this.bucket.file(fileName);

      await bucketFile.save(file.buffer, {
        public: true,
        metadata: { contentType: file.mimetype },
      });

      return {
        imageId: fileName,
        imageUrl: bucketFile.publicUrl(),
      };
    } catch (error) {
      console.error('Firebase Buffer Upload Error:', error);
      throw new InternalServerErrorException('Failed to upload buffer image');
    }
  }

  // 5. Delete image
  async deleteBusinessImage(publicId: string): Promise<boolean> {
    try {
      const file = this.bucket.file(publicId);
      await file.delete();
      return true;
    } catch (error) {
      console.error('Firebase Deletion Error:', error);
      throw new InternalServerErrorException('Failed to delete image');
    }
  }
}