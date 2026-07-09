import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export const BusinessCloudinaryConfig = (configService: ConfigService) => {
  cloudinary.config({
    cloud_name: configService.get<string>('BUSINESS_CLOUDINARY_CLOUD_NAME'),
    api_key: configService.get<string>('BUSINESS_CLOUDINARY_API_KEY'),
    api_secret: configService.get<string>('BUSINESS_CLOUDINARY_API_SECRET'),
  });

  return cloudinary;
};
