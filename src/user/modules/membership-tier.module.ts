import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipTier } from '../user_entities/membership-tier.entity';
import { MembershipSubscription } from '../user_entities/membership-subscription.entity';
import { MembershipTierService } from '../services/membership-tier.service';
import { MembershipService } from '../services/membership-subscription.service';
import { MembershipTierController } from '../controllers/membership-tier.controller';
import { MembershipSubscriptionController } from '../controllers/membership-subscription.controller';
import { Card } from 'src/all_user_entities/card.entity';
import { Transaction } from 'src/business/entities/transaction.entity';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';
import { PaystackService } from 'src/payment/paystack.service';
import { PlatformSettingsModule } from 'src/admin/platform-settings/platform-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MembershipTier, MembershipSubscription, Card, Transaction, BusinessGiftCard]),
    PlatformSettingsModule,
  ],
  controllers: [MembershipTierController, MembershipSubscriptionController],
  providers: [MembershipTierService, MembershipService, PaystackService],
  exports: [MembershipTierService, MembershipService],
})
export class MembershipModule implements OnModuleInit {
  constructor(private readonly membershipTierService: MembershipTierService) {}

  // Seed default membership tiers automatically at startup
  async onModuleInit() {
    await this.membershipTierService.seedDefaultTiers();
  }
}
