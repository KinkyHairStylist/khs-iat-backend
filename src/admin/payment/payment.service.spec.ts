import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from './payment.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { Business } from 'src/business/entities/business.entity';
import { Transaction } from 'src/business/entities/transaction.entity';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PaymentService', () => {
  let service: PaymentService;

  const mockPaymentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    clear: jest.fn(),
  };

  const mockBusinessRepo = {
    findOne: jest.fn(),
  };

  const mockTransactionRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const mockWalletService = {
    addFunds: jest.fn(),
  };

  beforeEach(async () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_key';
    process.env.PAYSTACK_BASE_URL = 'https://api.paystack.co';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: getRepositoryToken(Payment),
          useValue: mockPaymentRepo,
        },
        {
          provide: getRepositoryToken(Business),
          useValue: mockBusinessRepo,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepo,
        },
        {
          provide: BusinessWalletService,
          useValue: mockWalletService,
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    jest.clearAllMocks();
  });

  describe('env-driven Paystack config', () => {
    it('reads PAYSTACK_SECRET_KEY from environment', () => {
      expect((service as any).paystackAcessKey).toBe('sk_test_key');
    });

    it('reads PAYSTACK_BASE_URL from environment', () => {
      expect((service as any).paystackBaseUrl).toBe('https://api.paystack.co');
    });

    it('reads FRONTEND_URL from environment', () => {
      expect((service as any).frontendUrl).toBe('http://localhost:3000');
    });

    it('has no PayPal fields on the service', () => {
      expect((service as any).paypalBaseUrl).toBeUndefined();
      expect((service as any).clientId).toBeUndefined();
      expect((service as any).clientSecret).toBeUndefined();
    });
  });

  describe('createPaystackPayment', () => {
    const dto = {
      senderId: 'user-1',
      businessId: 'biz-1',
      senderEmail: 'client@example.com',
      description: 'Haircut payment',
      business: 'Acme Salon',
      amount: 5000,
      method: 'paystack',
    };

    const mockBusiness = {
      id: 'biz-1',
      businessName: 'Acme Salon',
      ownerId: 'owner-1',
    };

    it('throws BadRequestException when senderEmail is missing', async () => {
      await expect(
        service.createPaystackPayment({ ...dto, senderEmail: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when business not found', async () => {
      mockBusinessRepo.findOne.mockResolvedValue(null);
      await expect(service.createPaystackPayment(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when amount is zero', async () => {
      mockBusinessRepo.findOne.mockResolvedValue(mockBusiness);
      await expect(
        service.createPaystackPayment({ ...dto, amount: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when method is not paystack', async () => {
      mockBusinessRepo.findOne.mockResolvedValue(mockBusiness);
      await expect(
        service.createPaystackPayment({ ...dto, method: 'paypal' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('initializes a Paystack transaction with amount in kobo and saves pending payment', async () => {
      mockBusinessRepo.findOne.mockResolvedValue(mockBusiness);
      mockedAxios.post.mockResolvedValue({
        data: {
          data: {
            authorization_url: 'https://paystack.com/pay/abc',
            reference: 'REF-123',
          },
        },
      });
      const savedPayment = {
        id: 'pay-1',
        status: 'pending',
        gatewayTransactionId: 'REF-123',
      };
      mockPaymentRepo.create.mockReturnValue(savedPayment);
      mockPaymentRepo.save.mockResolvedValue(savedPayment);

      const result = await service.createPaystackPayment(dto);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.paystack.co/transaction/initialize',
        expect.objectContaining({
          email: 'client@example.com',
          amount: 5000 * 100,
          callback_url: 'http://localhost:3000/clients/complete-payment',
        }),
        expect.objectContaining({
          headers: { Authorization: 'Bearer sk_test_key' },
        }),
      );
      expect(result.authorizationUrl).toBe('https://paystack.com/pay/abc');
      expect(result.reference).toBe('REF-123');
      expect(mockPaymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('throws InternalServerErrorException when Paystack returns no authorization URL', async () => {
      mockBusinessRepo.findOne.mockResolvedValue(mockBusiness);
      mockedAxios.post.mockResolvedValue({
        data: { data: { authorization_url: null, reference: 'REF-123' } },
      });

      await expect(service.createPaystackPayment(dto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('verifyPaystackPayment', () => {
    const reference = 'REF-123';
    const pendingPayment = {
      id: 'pay-1',
      status: 'pending',
      gatewayTransactionId: reference,
      businessId: 'biz-1',
      recipientId: 'owner-1',
      senderId: 'user-1',
      reason: 'Haircut',
      sender: { email: 'client@example.com' },
    };

    it('throws BadRequestException when reference is empty', async () => {
      await expect(service.verifyPaystackPayment('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws InternalServerErrorException when payment record not found', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);
      await expect(service.verifyPaystackPayment(reference)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('returns early when payment is already successful', async () => {
      mockPaymentRepo.findOne.mockResolvedValue({
        ...pendingPayment,
        status: 'successful',
      });

      const result = await service.verifyPaystackPayment(reference);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Payment already verified');
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('marks payment successful and adds wallet funds on Paystack success response', async () => {
      mockPaymentRepo.findOne.mockResolvedValue({ ...pendingPayment });
      mockPaymentRepo.save.mockResolvedValue({
        ...pendingPayment,
        status: 'successful',
      });
      mockedAxios.get.mockResolvedValue({
        data: {
          status: true,
          data: { amount: 500000, channel: 'card', currency: 'NGN' },
        },
      });
      mockWalletService.addFunds.mockResolvedValue(undefined);

      const result = await service.verifyPaystackPayment(reference);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `https://api.paystack.co/transaction/verify/${reference}`,
        expect.objectContaining({
          headers: { Authorization: 'Bearer sk_test_key' },
        }),
      );
      expect(mockWalletService.addFunds).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('marks payment as failed when Paystack returns status false', async () => {
      mockPaymentRepo.findOne.mockResolvedValue({ ...pendingPayment });
      mockPaymentRepo.save.mockResolvedValue({
        ...pendingPayment,
        status: 'failed',
      });
      mockedAxios.get.mockResolvedValue({
        data: { status: false, data: {} },
      });

      await service.verifyPaystackPayment(reference);

      expect(mockPaymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(mockWalletService.addFunds).not.toHaveBeenCalled();
    });
  });

  describe('getOne', () => {
    it('throws NotFoundException when payment not found', async () => {
      mockPaymentRepo.findOne.mockResolvedValue(null);
      await expect(service.getOne('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('returns payment when found', async () => {
      const payment = { id: 'pay-1', status: 'successful' };
      mockPaymentRepo.findOne.mockResolvedValue(payment);
      const result = await service.getOne('pay-1');
      expect(result).toEqual(payment);
    });
  });

  describe('deleteAllPayments', () => {
    it('clears the payment table', async () => {
      mockPaymentRepo.clear.mockResolvedValue(undefined);
      const result = await service.deleteAllPayments();
      expect(mockPaymentRepo.clear).toHaveBeenCalled();
      expect(result.message).toBe('All payments deleted.');
    });
  });
});
