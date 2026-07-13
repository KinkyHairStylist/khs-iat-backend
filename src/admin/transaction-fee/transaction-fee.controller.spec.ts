import { Test, TestingModule } from '@nestjs/testing';
import { TransactionFeeController } from './transaction-fee.controller';

describe('TransactionFeeController', () => {
  let controller: TransactionFeeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionFeeController],
    }).compile();

    controller = module.get<TransactionFeeController>(TransactionFeeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
