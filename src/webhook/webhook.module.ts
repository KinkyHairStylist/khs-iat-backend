import { Module } from '@nestjs/common';
import { WebhookController } from './controller/webhook.controller';
import { WebhookService } from './services/webhook.service';
import { PaymentModule } from 'src/admin/payment/payment.module';

@Module({
  imports: [PaymentModule],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
