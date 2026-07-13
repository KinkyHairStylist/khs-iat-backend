import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from '../../all_user_entities/card.entity';
import { MembershipSubscription } from '../user_entities/membership-subscription.entity';
import { CardService } from '../services/card.service';
import { CardController } from '../controllers/card.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Card, MembershipSubscription])],
  providers: [CardService],
  controllers: [CardController],
  exports: [CardService],
})
export class CardModule {}
