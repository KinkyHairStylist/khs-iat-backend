import { Test, TestingModule } from '@nestjs/testing';
import { PlatformSettingsController } from './platform-settings.controller';

describe('PlatformSettingsController', () => {
  let controller: PlatformSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformSettingsController],
    }).compile();

    controller = module.get<PlatformSettingsController>(PlatformSettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
