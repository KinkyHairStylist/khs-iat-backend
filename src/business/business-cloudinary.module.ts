import { Module } from '@nestjs/common';
import { BusinessCloudinaryService } from './services/business-cloudinary.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BusinessCloudinaryConfig } from './config/business.cloudinary.config';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'BUSINESS_CLOUDINARY',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        BusinessCloudinaryConfig(configService),
    },
    BusinessCloudinaryService,
  ],
  exports: [BusinessCloudinaryService],
})
export class BusinessCloudinaryModule {}
