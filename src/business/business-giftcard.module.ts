import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessGiftCard } from './entities/business-giftcard.entity';
import { BusinessGiftCardsController } from './controllers/business-giftcard.controller';
import { BusinessGiftCardsService } from './services/business-giftcard.service';
import { Business } from './entities/business.entity';
import { Transaction } from './entities/transaction.entity';
import { PlatformSettingsEntity } from 'src/platform-settings/entities/platform-settings.entity';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import { BusinessWalletModule } from './wallet.module';
import { EmailModule } from 'src/email/email.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([BusinessGiftCard, Business, Transaction, PlatformSettingsEntity]),
    BusinessWalletModule,
    EmailModule,
  ],
  controllers: [BusinessGiftCardsController],
  providers: [BusinessGiftCardsService, PlatformSettingsService],
  exports: [BusinessGiftCardsService],
})
export class BusinessGiftCardsModule {}
