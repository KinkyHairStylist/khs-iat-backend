import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformSettingsEntity } from './entities/platform-settings.entity';

describe('PlatformSettingsService', () => {
  let service: PlatformSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformSettingsService,
        // No repository was ever provided here, so this failed to compile
        // with a DI resolution error before a single test ran.
        { provide: getRepositoryToken(PlatformSettingsEntity), useValue: {} },
      ],
    }).compile();

    service = module.get<PlatformSettingsService>(PlatformSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
