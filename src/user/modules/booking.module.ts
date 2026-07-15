import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from 'src/email/email.module';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Business } from 'src/business/entities/business.entity';
import { Service } from 'src/business/entities/service.entity';
import { Staff } from 'src/business/entities/staff.entity';
import { Transaction } from 'src/business/entities/transaction.entity';
import { BookingService } from '../services/booking.service';
import { BookingController } from '../controllers/booking.controller';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { PlatformSettingsService } from 'src/admin/platform-settings/platform-settings.service';
import { PlatformSettingsEntity } from 'src/admin/platform-settings/entities/platform-settings.entity';
import { ReviewModule } from 'src/business/review.module';
import { BusinessWalletModule } from 'src/business/wallet.module';
import { Review } from 'src/business/entities/review.entity';
import { ClientSchema } from 'src/business/entities/client.entity';
import { Card } from 'src/all_user_entities/card.entity';
import { PaystackService } from 'src/payment/paystack.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Business, Service, Staff, Transaction, BusinessGiftCard, PlatformSettingsEntity, Review, ClientSchema, Card]),
    ReviewModule,
    BusinessWalletModule,
    EmailModule,
  ],
  controllers: [BookingController],
  providers: [BookingService, PlatformSettingsService, PaystackService],
})
export class BookingModule {}
