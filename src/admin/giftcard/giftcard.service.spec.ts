import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GiftcardService } from './admin_giftcard.service';
import { BusinessGiftCard } from '../../business/entities/business-giftcard.entity';
import { User } from '../../all_user_entities/user.entity';

describe('GiftcardService', () => {
  let service: GiftcardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GiftcardService,
        // No repositories were ever provided here, so this failed to
        // compile with a DI resolution error before a single test ran.
        { provide: getRepositoryToken(BusinessGiftCard), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
      ],
    }).compile();

    service = module.get<GiftcardService>(GiftcardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
