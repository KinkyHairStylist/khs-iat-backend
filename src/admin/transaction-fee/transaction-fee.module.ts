import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionFeeConfigHistory } from './entities/TransactionFeeConfigHistory';
import { TransactionFeeConfig } from './entities/transaction-fee.entity';
import { TransactionFeeService } from './transaction-fee.service';
import { TransactionFeeController } from './transaction-fee.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionFeeConfig, TransactionFeeConfigHistory])], 
  controllers: [TransactionFeeController],
  providers: [TransactionFeeService],
})
export class TransactionFeeModule {}
