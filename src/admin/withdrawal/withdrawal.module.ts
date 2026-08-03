import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Wallet } from 'src/business/entities/wallet.entity';
import { Transaction } from 'src/business/entities/transaction.entity';
import { Business } from 'src/business/entities/business.entity';
import { Withdrawal } from './entities/withdrawal.entity';
import { WithdrawalService } from './withdrawal.service';
import { WithdrawalController } from './withdrawal.controller';
import { GiftcardModule } from '../giftcard/admin_giftcard.module';
import { PaymentModule } from 'src/payment/payment.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([Withdrawal, Wallet, Transaction, Business]),
    GiftcardModule,
    PaymentModule,
  ],
  controllers: [WithdrawalController],
  providers: [WithdrawalService],
})
export class WithdrawalModule {}
