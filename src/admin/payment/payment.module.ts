import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { Business } from 'src/business/entities/business.entity';
import { BusinessWalletModule } from 'src/business/wallet.module';
import { Transaction } from 'src/business/entities/transaction.entity';
import { StripePaymentIntent } from 'src/payment/entities/stripe-payment-intent.entity';
import { Appointment } from 'src/business/entities/appointment.entity';
import { Refund } from 'src/user/user_entities/refund.entity';
import { StripeService } from 'src/payment/stripe.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      Business,
      Transaction,
      StripePaymentIntent,
      Appointment,
      Refund,
    ]),
    BusinessWalletModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, StripeService],
  exports: [PaymentService],
})
export class PaymentModule {}
