import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Service } from 'src/business/entities/service.entity';
import { Business } from 'src/business/entities/business.entity';
import { BusinessServicesController } from '../controllers/business-services.controller';
import { BusinessServicesService } from '../services/business-services.service';

@Module({
  imports: [TypeOrmModule.forFeature([Service, Business])],
  controllers: [BusinessServicesController],
  providers: [BusinessServicesService],
  exports: [BusinessServicesService],
})
export class BusinessServicesModule {}
