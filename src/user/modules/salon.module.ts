import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Service } from 'src/business/entities/service.entity';
import { Business } from 'src/business/entities/business.entity';
import { SalonController } from '../controllers/salon.controller';
import { SalonService } from '../services/salon.service';
import { BusinessRepository } from '../user_utilities/salon.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Business, Service])],
  controllers: [SalonController],
  providers: [SalonService, BusinessRepository],
  exports: [SalonService],
})
export class SalonModule {}