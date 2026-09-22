import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Wallet } from 'src/business/entities/wallet.entity';
import { Transaction } from 'src/business/entities/transaction.entity';
import { Business } from 'src/business/entities/business.entity';
import { Withdrawal } from './entities/withdrawal.entity';
import { WithdrawalService } from './withdrawal.service';
import { WithdrawalController } from './withdrawal.controller';
import { EmailModule } from 'src/email/email.module';
import { BusinessWalletModule } from 'src/business/wallet.module';
import { NotificationModule } from 'src/notifications/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Withdrawal, Wallet, Transaction, Business]),
    EmailModule,
    BusinessWalletModule,
    NotificationModule,
  ],
  controllers: [WithdrawalController],
  providers: [WithdrawalService],
})
export class WithdrawalModule {}
