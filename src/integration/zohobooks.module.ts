import { Module } from '@nestjs/common';
import { ZohoBooksCredentials } from './entities/zohobooks-credentials.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZohoBooksService } from './services/zohobooks.service';
import { ZohoBooksController } from './controllers/zohobooks.controller';
import { Appointment } from 'src/business/entities/appointment.entity';
import { BusinessOwnerSettingsModule } from 'src/business/business-owner-settings.module';
import { IntegrationCoreModule } from './integration-core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, ZohoBooksCredentials]),
    BusinessOwnerSettingsModule,
    IntegrationCoreModule,
  ],
  providers: [ZohoBooksService],
  controllers: [ZohoBooksController],
  exports: [ZohoBooksService],
})
export class ZohoBooksModule {}
