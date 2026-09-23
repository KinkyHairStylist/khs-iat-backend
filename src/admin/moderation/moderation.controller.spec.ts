import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { UserService } from '../../user/services/user.service';

describe('ModerationController', () => {
  let controller: ModerationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModerationController],
      providers: [
        { provide: ModerationService, useValue: {} },
        // ModerationController is @UseGuards(JwtAuthGuard, RolesGuard) --
        // JwtAuthGuard's own constructor (Reflector, JwtService,
        // UserService) gets resolved eagerly when this module compiles.
        // None of its providers were ever supplied here, so this failed
        // to compile with a DI resolution error before a single test ran.
        { provide: JwtService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ModerationController>(ModerationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
