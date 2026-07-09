import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessGiftCard } from './entities/business-giftcard.entity';
import { BusinessGiftCardsController } from './controllers/business-giftcard.controller';
import { BusinessGiftCardsService } from './services/business-giftcard.service';
import { Business } from './entities/business.entity';
@Module({
  imports: [TypeOrmModule.forFeature([BusinessGiftCard, Business])],
  controllers: [BusinessGiftCardsController],
  providers: [BusinessGiftCardsService],
  exports: [BusinessGiftCardsService],
})
export class BusinessGiftCardsModule {}
