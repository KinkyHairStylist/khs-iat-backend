import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientModule } from './client.module';
import { ClientSchema } from './entities/client.entity';
import { Promotion } from './entities/promotion.entity';
import { PromotionController } from './controllers/promotion.controller';
import { PromotionService } from './services/promotion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Promotion, ClientSchema]), // ✅ Load Reminder repository
    ClientModule,
  ],
  controllers: [PromotionController], // ✅ Expose controller
  providers: [PromotionService], // ✅ Provide service
  exports: [PromotionService], // ✅ Export if other modules need it
})
export class PromotionModule {}
