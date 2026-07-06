import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { EmailModule } from './email/email.module';
import { BusinessModule } from './business/business.module';
import { AdminModule } from './admin/admin.module';
import { GiftcardModule } from './admin/giftcard/admin_giftcard.module';
import { PaymentModule } from './admin/payment/payment.module';
import { TransactionFeeModule } from './admin/transaction-fee/transaction-fee.module';
import { WithdrawalModule } from './admin/withdrawal/withdrawal.module';
import { WalletModule } from './admin/wallet/wallet.module';
import { SalonModule } from './user/modules/salon.module';
import { BookingModule } from './user/modules/booking.module';
import { BusinessServicesModule } from './user/modules/business-services.module';
import { FavoriteServiceModule } from './user/modules/favorite-service.module';

import { AppService } from './app.service';
import { AppController } from './app.controller';
import { typeOrmConfig as testTypeOrmConfig } from './config/database.test';
import { typeOrmConfig } from './config/database';
import { JwtAuthGuard } from './middleware/jwt-auth.guard';
import { ReferralModule } from './user/modules/referral.module';
import { MembershipModule } from './user/modules/membership-tier.module';
import { CardModule } from './user/modules/card.module';
import { ModerationModule } from './admin/moderation/moderation.module';
import { ChatModule } from './admin/live-chat/chat.module';
import { PlatformSettingsModule } from './admin/platform-settings/platform-settings.module';
import { NotificationSettingsModule } from './user/modules/notification-settings.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { ClientModule } from './business/client.module';
import { UserModule } from './user/modules/user.module';
import { ReminderModule } from './business/reminder.module';
import { CustomMessageModule } from './business/custom-message.module';
import { PromotionModule } from './business/promotion.module';
import { ReviewModule } from './business/review.module';
import { CommunicationModule } from './business/communication.module';
import { BusinessWalletModule } from './business/wallet.module';
import { WebhookModule } from './webhook/webhook.module';
import { InventoryModule } from './marketplace/inventory.module';
import { ProductModule } from './marketplace/product.module';
import { BusinessGiftCardsModule } from './business/business-giftcard.module';
import { BusinessOwnerSettingsModule } from './business/business-owner-settings.module';
import { BusinessSettingsModule } from './business/business-settings.module';
import { GoogleCalendarModule } from './integration/google-calendar.module';
import { MailchimpModule } from './integration/mail-chimp.module';
import { ZohoBooksModule } from './integration/zohobooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot(
      process.env.NODE_ENV === 'test'
        ? { ...testTypeOrmConfig, autoLoadEntities: true }
        : { ...typeOrmConfig, autoLoadEntities: true },
    ),
    JwtModule.registerAsync({
      global: true, // Make JwtModule globally available
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 30_000, // 30 seconds
        limit: 10, // 20 requests per minute
      },
    ]),

    EmailModule,
    BusinessModule,
    AdminModule,
    GiftcardModule,
    PaymentModule,
    TransactionFeeModule,
    WithdrawalModule,
    WalletModule,
    ClientModule,
    ReminderModule,
    CustomMessageModule,
    PromotionModule,
    ReviewModule,
    CommunicationModule,
    BusinessWalletModule,
    WebhookModule,
    UserModule,
    SalonModule,
    BookingModule,
    BusinessServicesModule,
    FavoriteServiceModule,
    ReferralModule,
    MembershipModule,
    CardModule,
    ModerationModule,
    ChatModule,
    PlatformSettingsModule,
    NotificationSettingsModule,
    ProductModule,
    InventoryModule,
    BusinessGiftCardsModule,
    BusinessOwnerSettingsModule,
    BusinessSettingsModule,
    GoogleCalendarModule,
    MailchimpModule,
    ZohoBooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
