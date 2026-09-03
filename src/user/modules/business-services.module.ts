import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Service } from 'src/business/entities/service.entity';
import { Business } from 'src/business/entities/business.entity';
import { BookingDay } from 'src/business/entities/booking-day.entity';
import { BlockedTimeSlot } from 'src/business/entities/blocked-time-slot.entity';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Staff } from 'src/business/entities/staff.entity';
import { BusinessServicesController } from '../controllers/business-services.controller';
import { BusinessServicesService } from '../services/business-services.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Service,
      Business,
      BookingDay,
      BlockedTimeSlot,
      Appointment,
      Staff,
    ]),
  ],
  controllers: [BusinessServicesController],
  providers: [BusinessServicesService],
  exports: [BusinessServicesService],
})
export class BusinessServicesModule {}
