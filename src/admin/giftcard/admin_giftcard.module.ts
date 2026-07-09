import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GiftcardService } from './admin_giftcard.service';
import { GiftcardController } from './admin_giftcard.controller';
import { Card } from 'src/all_user_entities/card.entity';
import { User } from 'src/all_user_entities/user.entity';
import { BusinessGiftCard } from 'src/business/entities/business-giftcard.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessGiftCard, Card, User])],
  controllers: [GiftcardController],
  providers: [GiftcardService],
  exports: [GiftcardService, TypeOrmModule],
})
export class GiftcardModule {}
