import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

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
