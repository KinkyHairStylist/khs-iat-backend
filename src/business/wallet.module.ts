import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletPaymentMethod } from './entities/payment-method.entity';
import { Transaction } from './entities/transaction.entity';
import { BusinessWalletController } from './controllers/wallet.controller';
import { BusinessWalletService } from './services/wallet.service';
import { Business } from './entities/business.entity';
import { Withdrawal } from 'src/admin/withdrawal/entities/withdrawal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      Transaction,
      WalletPaymentMethod,
      Business,
      Withdrawal,
    ]),
  ],
  controllers: [BusinessWalletController],
  providers: [BusinessWalletService],
  exports: [BusinessWalletService],
})
export class BusinessWalletModule {}
