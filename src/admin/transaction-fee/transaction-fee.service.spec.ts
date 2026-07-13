import { Test, TestingModule } from '@nestjs/testing';
import { TransactionFeeService } from './transaction-fee.service';

describe('TransactionFeeService', () => {
  let service: TransactionFeeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionFeeService],
    }).compile();

    service = module.get<TransactionFeeService>(TransactionFeeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
