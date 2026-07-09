import { Test, TestingModule } from '@nestjs/testing';
import { GiftcardController } from './admin_giftcard.controller';
import { GiftcardService } from './admin_giftcard.service';
import { JwtAuthGuard } from 'src/middleware/jwt-auth.guard';
import { RolesGuard } from 'src/middleware/roles.guard';

describe('GiftcardController', () => {
  let controller: GiftcardController;
  let service: GiftcardService;

  const mockGiftcardService = {
    getSummary: jest.fn().mockResolvedValue({
      totalAmount: 1000,
      activeCount: 10,
      usedCount: 5,
      expiredCount: 2,
      inactiveCount: 3,
    }),
    findAll: jest.fn().mockResolvedValue({
      message: 'Found 1 gift card(s).',
      total: 1,
      data: [
        {
          id: '1',
          sender: { id: '1', name: 'John Doe', email: 'john.doe@example.com' },
        },
      ],
    }),
    findOne: jest.fn().mockResolvedValue({
      message: 'Gift card fetched successfully.',
      data: {
        id: '1',
        sender: { id: '1', name: 'John Doe', email: 'john.doe@example.com' },
      },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GiftcardController],
      providers: [
        {
          provide: GiftcardService,
          useValue: mockGiftcardService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GiftcardController>(GiftcardController);
    service = module.get<GiftcardService>(GiftcardService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSummary', () => {
    it('should return a summary of gift cards', async () => {
      const result = await controller.getSummary();
      expect(service.getSummary).toHaveBeenCalled();
      expect(result).toEqual({
        totalAmount: 1000,
        activeCount: 10,
        usedCount: 5,
        expiredCount: 2,
        inactiveCount: 3,
      });
    });
  });

  // describe('findAll', () => {
  //   it('should return all gift cards with sanitized sender data', async () => {
  //     const result = await controller.findAll();
  //     expect(service.findAll).toHaveBeenCalled();
  //     expect(result.data[0].sender).toHaveProperty('name');
  //     expect(result.data[0].sender).not.toHaveProperty('password');
  //   });
  // });

  // describe('findOne', () => {
  //   it('should return a single gift card with sanitized sender data', async () => {
  //     const result = await controller.findOne('1');
  //     expect(service.findOne).toHaveBeenCalledWith('1');
  //     expect(result.data.sender).toHaveProperty('name');
  //     expect(result.data.sender).not.toHaveProperty('password');
  //   });
  // });
});
