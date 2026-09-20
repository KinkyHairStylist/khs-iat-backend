import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Business } from 'src/business/entities/business.entity';
import { StripePaymentIntent } from 'src/payment/entities/stripe-payment-intent.entity';
import { GoogleCalendarModule } from './google-calendar.module';
import { MailchimpModule } from './mail-chimp.module';
import { ZohoBooksModule } from './zohobooks.module';
import { IntegrationSyncService } from './services/integration-sync.service';
import { IntegrationsController } from './controllers/integrations.controller';
import { NotificationModule } from 'src/notifications/notification.module';

// Keeps a salon's connected apps in step with its bookings, and reports which
// apps are connected. The booking flow depends on IntegrationSyncService.
@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Business, StripePaymentIntent]),
    GoogleCalendarModule,
    MailchimpModule,
    ZohoBooksModule,
    NotificationModule,
  ],
  providers: [IntegrationSyncService],
  controllers: [IntegrationsController],
  exports: [IntegrationSyncService],
})
export class IntegrationsModule {}
