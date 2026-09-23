import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsService } from './platform-settings.service';
import { UserService } from '../../user/services/user.service';

describe('PlatformSettingsController', () => {
  let controller: PlatformSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformSettingsController],
      providers: [
        { provide: PlatformSettingsService, useValue: {} },
        // PlatformSettingsController is @UseGuards(JwtAuthGuard, RolesGuard)
        // -- JwtAuthGuard's own constructor (Reflector, JwtService,
        // UserService) gets resolved eagerly when this module compiles.
        // Neither was ever provided here, so this failed to compile with
        // a DI resolution error before a single test ran.
        { provide: JwtService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PlatformSettingsController>(PlatformSettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
