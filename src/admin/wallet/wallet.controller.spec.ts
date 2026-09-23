import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { UserService } from '../../user/services/user.service';

describe('WalletController', () => {
  let controller: WalletController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        { provide: WalletService, useValue: {} },
        // WalletController is @UseGuards(JwtAuthGuard, RolesGuard) --
        // JwtAuthGuard's own constructor (Reflector, JwtService,
        // UserService) gets resolved eagerly when this module compiles.
        // Neither was ever provided here, so this failed to compile with
        // a DI resolution error before a single test ran.
        { provide: JwtService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
