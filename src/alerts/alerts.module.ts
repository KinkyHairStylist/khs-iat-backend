import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemAlert } from './entities/system-alert.entity';
import { AlertsService } from './alerts.service';
import { PublicAlertsController } from './public-alerts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemAlert])],
  // Staff manage alerts in khs-iat-staff-be; only the public read is served here.
  controllers: [PublicAlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
