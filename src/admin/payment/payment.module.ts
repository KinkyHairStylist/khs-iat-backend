import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { Business } from 'src/business/entities/business.entity';
import { BusinessWalletModule } from 'src/business/wallet.module';
import { Transaction } from 'src/business/entities/transaction.entity';
import { PaymentModule as ProviderPaymentModule } from 'src/payment/payment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Business, Transaction]),
    BusinessWalletModule,
    ProviderPaymentModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
