import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TransactionFeeConfig } from './entities/transaction-fee.entity';
import { TransactionFeeConfigHistory } from './entities/TransactionFeeConfigHistory';
import { UpdateTransactionFeeDto } from './dto/update-transaction-fee.dto';

@Injectable()
export class TransactionFeeService {
  constructor(
    @InjectRepository(TransactionFeeConfig)
    private feeRepo: Repository<TransactionFeeConfig>,

    @InjectRepository(TransactionFeeConfigHistory)
    private historyRepo: Repository<TransactionFeeConfigHistory>,
  ) {}

  // Get the current transaction fee configuration
  async getCurrentConfig(): Promise<{ message: string; data: TransactionFeeConfig }> {
    // Try to find the single existing configuration
    let config = await this.feeRepo.findOneBy({});

    // If no config exists, create a default one
    if (!config) {
      config = this.feeRepo.create(); // default values
      await this.feeRepo.save(config);
      return {
        message: 'No existing configuration found — default configuration created successfully.',
        data: config,
      };
    }

    // Return the existing configuration
    return {
      message: 'Transaction fee configuration retrieved successfully.',
      data: config,
    };
  }

  //  Update the transaction fee settings
  async updateConfig(
    dto: UpdateTransactionFeeDto,
    userId: string, // pass the current user ID
  ): Promise<{ message: string; data: TransactionFeeConfig }> {
    // Retrieve current config
    const { data: currentConfig } = await this.getCurrentConfig();

    // Determine what actually changed
    const changes: Record<string, { before: any; after: any }> = {};
    for (const key of Object.keys(dto)) {
      if (currentConfig[key] !== undefined && currentConfig[key] !== dto[key]) {
        changes[key] = { before: currentConfig[key], after: dto[key] };
      }
    }

    // Update the configuration
    Object.assign(currentConfig, dto);
    const updated = await this.feeRepo.save(currentConfig);

    // Record history if there are changes
    if (Object.keys(changes).length > 0) {
      const history = this.historyRepo.create({
        configId: currentConfig.id,
        updatedBy: userId,
        changes,
      });
      await this.historyRepo.save(history);
    }

    return {
      message: 'Transaction fee configuration updated successfully.',
      data: updated,
    };
  }

  // Get a list of all previous fee configurations (change history)
  async getChangeHistory(): Promise<any[]> {
    const history = await this.historyRepo.find({
      order: { createdAt: 'DESC' },
    });

    if (!history.length) {
      throw new NotFoundException('No configuration change history found.');
    }

    return [
      {
        message: 'Transaction fee configuration history retrieved successfully.',
      },
      ...history,
    ];
  }
}
