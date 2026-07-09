import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FavoriteService } from '../user_entities/favorite-service.entity';
import { Service } from 'src/business/entities/service.entity';
import { User } from 'src/all_user_entities/user.entity';
import { FavoriteServiceController } from '../controllers/favorite-service.controller';
import { FavoriteServiceService } from '../services/favorite-service.service';

@Module({
  imports: [TypeOrmModule.forFeature([FavoriteService, Service, User])],
  controllers: [FavoriteServiceController],
  providers: [FavoriteServiceService],
  exports: [FavoriteServiceService],
})
export class FavoriteServiceModule {}