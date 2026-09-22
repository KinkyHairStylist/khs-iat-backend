import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipTier } from '../user_entities/membership-tier.entity';
import { MembershipSubscription } from '../user_entities/membership-subscription.entity';
import { MembershipService } from '../services/membership-subscription.service';
import { MembershipSubscriptionController } from '../controllers/membership-subscription.controller';
import { EmailModule } from 'src/email/email.module';

// Only what a holder of an old KHS-wide plan still needs: see it and cancel it. The plans are no
// longer sold, and the default tiers are no longer created at startup.
@Module({
  imports: [TypeOrmModule.forFeature([MembershipSubscription, MembershipTier]), EmailModule],
  controllers: [MembershipSubscriptionController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
