import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessOwnerSettings } from './entities/business-owner-settings.entity';
import { BusinessOwnerSettingsController } from './controllers/business-owner-settings.controller';
import { BusinessOwnerSettingsService } from './services/business-owner-settings.service';
import { UserModule } from 'src/user/modules/user.module';
import { Business } from './entities/business.entity';
import { BusinessCloudinaryModule } from './business-cloudinary.module';
import { User } from 'src/all_user_entities/user.entity';
import { FormidableMiddleware } from './middlewares/formidable.middleware';
import { UserProfileValidationMiddleware } from './middlewares/user-profile.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([BusinessOwnerSettings, Business, User]),
    UserModule,
    BusinessCloudinaryModule,
  ],
  controllers: [BusinessOwnerSettingsController],
  providers: [BusinessOwnerSettingsService],
  exports: [BusinessOwnerSettingsService],
})
export class BusinessOwnerSettingsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FormidableMiddleware).forRoutes({
      path: 'business-owner-settings/owner/update-profile',
      method: RequestMethod.PATCH,
    });

    consumer
      .apply(UserProfileValidationMiddleware)
      .forRoutes({
        path: 'business-owner-settings/owner/update-profile',
        method: RequestMethod.PATCH,
      });
  }
}
