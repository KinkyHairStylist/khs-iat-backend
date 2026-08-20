import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessSettingsController } from './controllers/business-settings.controller';
import { Business } from './entities/business.entity';
import { BusinessSettingsService } from './services/business-settings.service';
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { BookingDay } from './entities/booking-day.entity';
import { BusinessFirebaseModule } from './business-firebase.module';

import { FormidableMiddleware } from './middlewares/formidable.middleware';
import { BusinessImageValidationMiddleware } from './middlewares/business-image-upload.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, BookingDay]),
    // BusinessCloudinaryModule,
    BusinessFirebaseModule
  ],
  controllers: [BusinessSettingsController],
  providers: [BusinessSettingsService],
  exports: [BusinessSettingsService],
})
export class BusinessSettingsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FormidableMiddleware).forRoutes({
      path: 'business-settings/:businessId/add-images',
      method: RequestMethod.POST,
    });

    consumer.apply(BusinessImageValidationMiddleware).forRoutes({
      path: 'business-settings/:businessId/add-images',
      method: RequestMethod.POST,
    });
  }
}
