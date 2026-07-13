import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from 'src/business/entities/wallet.entity';
import { Transaction } from 'src/business/entities/transaction.entity';
import { BusinessWalletModule } from 'src/business/wallet.module';
import { WebhookController } from './controller/webhook.controller';
import { WebhookService } from './services/webhook.service';
import { PaymentModule } from 'src/admin/payment/payment.module';
import { WalletPaymentMethod } from 'src/business/entities/payment-method.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction, WalletPaymentMethod]),
    BusinessWalletModule,
    PaymentModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
