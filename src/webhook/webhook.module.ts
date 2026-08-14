import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from 'src/business/entities/wallet.entity';
import { Transaction } from 'src/business/entities/transaction.entity';
import { BusinessWalletModule } from 'src/business/wallet.module';
import { WebhookController } from './controller/webhook.controller';
import { PaystackWebhookController } from './controller/paystack_webhook_controller';
import { WebhookService } from './services/webhook.service';
import { PaymentModule } from 'src/admin/payment/payment.module';
import { WalletPaymentMethod } from 'src/business/entities/payment-method.entity';
import { StripeService } from 'src/payment/stripe.service';
import { BookingModule } from 'src/user/modules/booking.module';
import { UserModule } from 'src/user/modules/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction, WalletPaymentMethod]),
    BusinessWalletModule,
    PaymentModule,
    BookingModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService, StripeService],
  exports: [WebhookService],
})
export class WebhookModule {}
