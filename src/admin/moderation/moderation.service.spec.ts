import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ModerationService } from './moderation.service';
import { FlaggedContent } from './entities/flagged-content.entity';
import { ModerationSettings } from './entities/moderation-settings.entity';

describe('ModerationService', () => {
  let service: ModerationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModerationService,
        // No repositories were ever provided here, so this failed to
        // compile with a DI resolution error before a single test ran.
        { provide: getRepositoryToken(FlaggedContent), useValue: {} },
        { provide: getRepositoryToken(ModerationSettings), useValue: {} },
      ],
    }).compile();

    service = module.get<ModerationService>(ModerationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
