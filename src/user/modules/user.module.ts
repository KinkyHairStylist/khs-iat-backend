import {
  Global,
  Module,
  MiddlewareConsumer,
  forwardRef,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Card } from 'src/all_user_entities/card.entity';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { Transaction } from 'src/business/entities/transaction.entity';
import { MerchantMembershipPackage } from 'src/business/entities/merchant-membership-package.entity';
import { MerchantMembershipPurchase } from 'src/business/entities/merchant-membership-purchase.entity';
import { Business } from 'src/business/entities/business.entity';
import { User } from '../../all_user_entities/user.entity';
import { Referral } from '../user_entities/referrals.entity';
import { Article } from 'src/all_user_entities/article.entity';
import { Refund } from '../user_entities/refund.entity';
import { UserAddress } from '../user_entities/address.entity';

import { UserController } from '../controllers/user.controller';
import { GiftCardController } from '../controllers/gift-card.controller';
import { MembershipPackageController } from '../controllers/membership-package.controller';
import { ArticleController } from '../controllers/article.controller';
import { TransactionController } from '../controllers/transaction.controller';
import { AddressController } from '../controllers/address.controller';
import { UserProfileController } from '../controllers/user-profile.controller';

import { UserService } from '../services/user.service';
import { GiftCardService } from '../services/gift-card.service';
import { MembershipPackagePurchaseService } from '../services/membership-package-purchase.service';
import { ArticleService } from '../services/article.service';
import { TransactionService } from '../services/transaction.service';
import { AddressService } from '../services/address.service';
import { UserProfileService } from '../services/user-profile.service';

import { EmailValidationMiddleware } from '../../middleware/email-validation.middleware';
import { JwtRefreshStrategy } from '../../middleware/strategy/jwt-refresh.strategy';
import { EmailModule } from '../../email/email.module';
import { ReferralModule } from './referral.module';
import { PhoneVerificationModule } from './phone-verification.module';
import { PhoneVerification } from 'src/business/entities/phone-verification.entity';
import { PreferencesModule } from './preferences.module';
import { PasswordUtil } from 'src/business/utils/password.util';
import { PaystackService } from 'src/payment/paystack.service';
import { StripeService } from 'src/payment/stripe.service';
import { BusinessModule } from 'src/business/business.module';
import { BusinessWalletModule } from 'src/business/wallet.module';
import { PlatformSettingsModule } from '../../admin/platform-settings/platform-settings.module';
import { AdminChatModule } from './admin-chat.module';
import { NotificationModule } from 'src/notifications/notification.module';
import { SlackModule } from 'src/slack/slack.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Referral,
      BusinessGiftCard,
      Card,
      Article,
      Transaction,
      Refund,
      UserAddress,
      PhoneVerification,
      MerchantMembershipPackage,
      MerchantMembershipPurchase,
      Business,
    ]),
    forwardRef(() => BusinessModule),
    BusinessWalletModule,
    EmailModule,
    SlackModule,
    ReferralModule,
    PhoneVerificationModule,
    PreferencesModule,
    PlatformSettingsModule,
    AdminChatModule,
    NotificationModule,
  ],
  controllers: [
    UserController,
    GiftCardController,
    MembershipPackageController,
    ArticleController,
    TransactionController,
    AddressController,
    // TicketController,
    UserProfileController,
  ],
  providers: [
    UserService,
    JwtRefreshStrategy,
    GiftCardService,
    MembershipPackagePurchaseService,
    ArticleService,
    TransactionService,
    AddressService,
    // TicketService,
    UserProfileService,
    PasswordUtil,
    PaystackService, // keep PaystackService here
    StripeService,
  ],
  exports: [UserService, GiftCardService], // <-- export GiftCardService if needed elsewhere
})
export class UserModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(EmailValidationMiddleware)
      .exclude({ path: 'api/auth/refresh-token', method: RequestMethod.POST })
      .forRoutes(UserController);
  }
}
