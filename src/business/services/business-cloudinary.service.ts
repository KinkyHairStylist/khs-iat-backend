import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import * as streamifier from 'streamifier';

export interface UploadResult {
  imageId: string;
  imageUrl: string;
}

export interface FileUpload {
  filepath: string;
  mimetype: string;
  originalFilename: string;
  size: number;
}
@Injectable()
export class BusinessCloudinaryService {
  constructor(@Inject('BUSINESS_CLOUDINARY') private cloudinary: any) {}

  async uploadImage(file: any, folderPath: string): Promise<UploadResult> {
    try {
      await this.cloudinary.api.delete_resources_by_prefix(folderPath);

      const result = await this.cloudinary.uploader.upload(file.filepath, {
        folder: folderPath,
        use_filename: true,
        unique_filename: false,
        transformation: { gravity: 'face' },
      });

      const publicId = result?.public_id;
      const imageId = publicId?.split('/').pop();
      const imageUrl = result?.secure_url;

      return { imageId, imageUrl };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new InternalServerErrorException('Failed to upload profileImage');
    }
  }

  async uploadBusinessImage(
    file: any,
    folderPath: string,
  ): Promise<UploadResult> {
    try {
      const result = await this.cloudinary.uploader.upload(file.filepath, {
        folder: folderPath,
        use_filename: true,
        unique_filename: false,
      });

      const publicId = result?.public_id;
      const imageId = publicId?.split('/').pop(); // store this in DB for deletion later
      const imageUrl = result?.secure_url;

      return { imageId, imageUrl };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new InternalServerErrorException('Failed to upload business image');
    }
  }

  async uploadImageFromBase64(
    dataUri: string,
    folderPath: string,
  ): Promise<UploadResult> {
    try {
      const result = await this.cloudinary.uploader.upload(dataUri, {
        folder: folderPath,
        use_filename: true,
        unique_filename: true,
      });
      const publicId: string = result?.public_id;
      return {
        imageId: publicId?.split('/').pop() ?? publicId,
        imageUrl: result?.secure_url,
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new InternalServerErrorException('Failed to upload product image');
    }
  }

  async uploadImageFromBuffer(
    file: Express.Multer.File,
    folderPath: string,
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          folder: folderPath,
          use_filename: true,
          unique_filename: false,
        },
        (error: any, result: any) => {
          if (error || !result) {
            return reject(new InternalServerErrorException('Failed to upload product image'));
          }
          const publicId: string = result.public_id;
          resolve({
            imageId: publicId.split('/').pop() ?? publicId,
            imageUrl: result.secure_url,
          });
        },
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  async deleteBusinessImage(publicId: string): Promise<boolean> {
    try {
      const result = await this.cloudinary.uploader.destroy(publicId);

      if (result.result !== 'ok' && result.result !== 'not_found') {
        throw new Error(`Cloudinary deletion failed for ${publicId}`);
      }

      return true;
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw new InternalServerErrorException('Failed to delete business image');
    }
  }
}
