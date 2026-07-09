import { Module } from '@nestjs/common';
import { CloudinaryService } from '../services/cloudinary.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudinaryConfig } from 'src/config/cloudinary.config';

const CloudinaryProvider = {
  provide: 'Cloudinary',
  useFactory: (configService: ConfigService) => {
    return CloudinaryConfig(configService);
  },
  inject: [ConfigService],
};

@Module({
  imports: [ConfigModule],
  providers: [CloudinaryService, CloudinaryProvider],
  exports: [CloudinaryService, CloudinaryProvider],
})
export class CloudinaryModule {}
