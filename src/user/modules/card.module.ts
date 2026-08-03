import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from '../../all_user_entities/card.entity';
import { MembershipSubscription } from '../user_entities/membership-subscription.entity';
import { CardService } from '../services/card.service';
import { CardController } from '../controllers/card.controller';
import { PaymentModule } from 'src/payment/payment.module';

@Module({
  imports: [TypeOrmModule.forFeature([Card, MembershipSubscription]), PaymentModule],
  providers: [CardService],
  controllers: [CardController],
  exports: [CardService],
})
export class CardModule {}
