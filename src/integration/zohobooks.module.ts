import { Module } from '@nestjs/common';
import { ZohoBooksCredentials } from './entities/zohobooks-credentials.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZohoBooksService } from './services/zohobooks.service';
import { ZohoBooksController } from './controllers/zohobooks.controller';
import { Appointment } from 'src/business/entities/appointment.entity';
import { BusinessOwnerSettingsModule } from 'src/business/business-owner-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, ZohoBooksCredentials]),
    BusinessOwnerSettingsModule,
  ],
  providers: [ZohoBooksService],
  controllers: [ZohoBooksController],
  exports: [ZohoBooksService],
})
export class ZohoBooksModule {}
