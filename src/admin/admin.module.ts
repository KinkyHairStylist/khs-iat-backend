import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './controllers/admin.controller';
import { ArticleController } from './controllers/article.controller';
import { AdminService } from './services/admin.service';
import { ArticleService } from './services/article.service';
import { Article } from '../all_user_entities/article.entity';
import { User } from '../all_user_entities/user.entity';
import { Business } from '../business/entities/business.entity';
import { AdminAuthController } from './controllers/admin_auth.controller';
import { AdminAuthService } from './services/admin_auth.service';
import { AdminAuthStrategy } from 'src/middleware/strategy/admin-auth.strategy';
import { AdminInvite } from './admin_entities/admin-invite.entity';
import { Appointment } from '../business/entities/appointment.entity';
import { Dispute } from '../business/entities/dispute.entity';
import { MembershipPlan } from '../business/entities/membership.entity';
import { MembershipTier } from '../user/user_entities/membership-tier.entity';
import { Subscription } from '../business/entities/subscription.entity';
import { Payment } from './payment/entities/payment.entity';
import { EmailModule } from '../email/email.module';
import { PaymentService } from './payment/payment.service';
import { CloudinaryModule } from '../user/modules/cloudinary.module';
import { BusinessWalletModule } from 'src/business/wallet.module';
import { Transaction } from 'src/business/entities/transaction.entity';
import { StripePaymentIntent } from 'src/payment/entities/stripe-payment-intent.entity';
import { Refund } from 'src/user/user_entities/refund.entity';
import { StripeService } from 'src/payment/stripe.service';
import { MerchantSubscription } from '../business/entities/merchant-subscription.entity';
import { MerchantSubscriptionService } from '../business/services/merchant-subscription.service';
import { MerchantSubscriptionCronService } from '../business/services/merchant-subscription-cron.service';
import { MerchantPlansService } from '../business/services/merchant-plans.service';
import { AdminPlansController } from './controllers/admin-plans.controller';
import { PlatformSettingsEntity } from './platform-settings/entities/platform-settings.entity';
import { PlatformSettingsService } from './platform-settings/platform-settings.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([User, AdminInvite]),
    TypeOrmModule.forFeature([MembershipPlan, MembershipTier]),
    TypeOrmModule.forFeature([Business]),
    TypeOrmModule.forFeature([Dispute]),
    TypeOrmModule.forFeature([Appointment]),
    TypeOrmModule.forFeature([Subscription]),
    TypeOrmModule.forFeature([Payment]),
    TypeOrmModule.forFeature([Article]),
    TypeOrmModule.forFeature([Transaction]),
    TypeOrmModule.forFeature([StripePaymentIntent]),
    TypeOrmModule.forFeature([Refund]),
    TypeOrmModule.forFeature([MerchantSubscription]),
    TypeOrmModule.forFeature([PlatformSettingsEntity]),
    CloudinaryModule,
    BusinessWalletModule,
    EmailModule,
  ],
  controllers: [AdminController, ArticleController, AdminAuthController, AdminPlansController],
  providers: [
    AdminService,
    PaymentService,
    StripeService,
    MerchantSubscriptionService,
    MerchantSubscriptionCronService,
    PlatformSettingsService,
    MerchantPlansService,
    ArticleService,
    AdminAuthService,
    AdminAuthStrategy,
  ],
  exports: [AdminService],
})
export class AdminModule {}
