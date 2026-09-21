import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessOwnerSettings } from './entities/business-owner-settings.entity';
import { BusinessOwnerSettingsController } from './controllers/business-owner-settings.controller';
import { BusinessOwnerSettingsService } from './services/business-owner-settings.service';
import { UserModule } from 'src/user/modules/user.module';
import { Business } from './entities/business.entity';
import { BusinessFirebaseModule } from './business-firebase.module';
import { User } from 'src/all_user_entities/user.entity';
import { FormidableMiddleware } from './middlewares/formidable.middleware';
import { UserProfileValidationMiddleware } from './middlewares/user-profile.middleware';
import { MerchantSubscription } from './entities/merchant-subscription.entity';
import { MerchantSubscriptionController } from './controllers/merchant-subscription.controller';
import { MerchantSubscriptionService } from './services/merchant-subscription.service';
import { StripeService } from 'src/payment/stripe.service';
import { PlatformSettingsEntity } from 'src/admin/platform-settings/entities/platform-settings.entity';
import { PlatformSettingsService } from 'src/admin/platform-settings/platform-settings.service';
import { EmailModule } from 'src/email/email.module';
import { MerchantPlansService } from './services/merchant-plans.service';
import { MerchantSignupService } from './services/merchant-signup.service';
import { MerchantSignupController } from './controllers/merchant-signup.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessOwnerSettings,
      Business,
      User,
      MerchantSubscription,
      PlatformSettingsEntity,
    ]),
    UserModule,
    // BusinessCloudinaryModule,
    BusinessFirebaseModule,
    EmailModule,
  ],
  controllers: [
    BusinessOwnerSettingsController,
    MerchantSubscriptionController,
    MerchantSignupController,
  ],
  providers: [
    BusinessOwnerSettingsService,
    MerchantSubscriptionService,
    StripeService,
    PlatformSettingsService,
    MerchantPlansService,
    MerchantSignupService,
  ],
  exports: [BusinessOwnerSettingsService, MerchantSignupService],
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
