import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from 'src/business/entities/appointment.entity';
import { GoogleCredentials } from './entities/google-credentials.entity';
import { GoogleCalendarService } from './services/google-calendar.service';
import { GoogleCalendarController } from './controllers/google-calendar.controller';
import { BusinessModule } from 'src/business/business.module';
import { BusinessOwnerSettingsModule } from 'src/business/business-owner-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, GoogleCredentials]),
    BusinessOwnerSettingsModule,
    forwardRef(() => BusinessModule),
  ],
  providers: [GoogleCalendarService],
  controllers: [GoogleCalendarController],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
