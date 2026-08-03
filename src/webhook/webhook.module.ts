import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from 'src/business/entities/wallet.entity';
import { Transaction } from 'src/business/entities/transaction.entity';
import { BusinessWalletModule } from 'src/business/wallet.module';
import { WebhookController } from './controller/webhook.controller';
import { PaystackWebhookController } from './controller/paystack_webhook_controller';
import { StripeWebhookController } from './controller/stripe_webhook_controller';
import { WebhookService } from './services/webhook.service';
import { PaymentModule } from 'src/admin/payment/payment.module';
import { WalletPaymentMethod } from 'src/business/entities/payment-method.entity';
import { UserModule } from 'src/user/modules/user.module';
import { PaymentModule as ProviderPaymentModule } from 'src/payment/payment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction, WalletPaymentMethod]),
    BusinessWalletModule,
    PaymentModule,
    UserModule,
    ProviderPaymentModule,
  ],
  // PaystackWebhookController (POST /webhooks/paystack) completes gift
  // card purchases specifically — was previously defined but never
  // registered in any module, so it was dead code and gift card purchases
  // never actually completed via webhook at all.
  controllers: [WebhookController, PaystackWebhookController, StripeWebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
