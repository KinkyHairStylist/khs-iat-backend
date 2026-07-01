import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { EmailModule } from './email/email.module';
import { BusinessModule } from './business/business.module';
import { AdminModule } from './admin/admin.module';
import { GiftcardModule } from './admin/giftcard/giftcard.module';
import { PaymentModule } from './admin/payment/payment.module';
import { TransactionFeeModule } from './admin/transaction-fee/transaction-fee.module';
import { WithdrawalModule } from './admin/withdrawal/withdrawal.module';
import { WalletModule } from './admin/wallet/wallet.module';
import { SalonModule } from './user/modules/salon.module';
// import { UserModule } from './user/user.module';


import { AppService } from './app.service';
import { AppController } from './app.controller';
import { SeedsModule } from './user/seeds/seed.module';
import { typeOrmConfig as testTypeOrmConfig } from './config/database.test';
import { typeOrmConfig } from './config/database';
import { AuthMiddleware } from './middleware/anth.middleware';
import { ReferralModule } from './user/modules/referral.module';
import { MembershipModule } from './user/modules/membership-tier.module';
// import { ModerationModule } from './admin/moderation/moderation.module';
import { ModerationModule } from './admin/moderation/moderation.module';
import { SupportModule } from './admin/support/support.module';
import { PlatformSettingsModule } from './admin/platform-settings/platform-settings.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot(
      process.env.NODE_ENV === 'test' ? testTypeOrmConfig : typeOrmConfig,
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
    TypeOrmModule.forRoot(
      process.env.NODE_ENV === 'test' ? testTypeOrmConfig : typeOrmConfig,
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
    EmailModule,
    BusinessModule,
    AdminModule,
    GiftcardModule,
    PaymentModule,
    TransactionFeeModule,
    WithdrawalModule,
    WalletModule,


    // UserModule,
    SalonModule,
    SeedsModule,
    ReferralModule,
    MembershipModule,
    ModerationModule,
    SupportModule,
    PlatformSettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService, AuthMiddleware],
})

export class AppModule {}
