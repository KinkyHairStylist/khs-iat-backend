import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { UserService } from '../../user/services/user.service';

/**
 * DEV-058: Controllers own { success, data } response shape.
 *
 * Verifies that the controller wraps service results correctly and
 * does NOT swallow errors — exceptions must propagate so NestJS
 * exception filters can return the right HTTP status code.
 */

const mockPayment = { id: 'pay-1', status: 'pending', amount: 5000 } as any;

const mockPaymentService = {
  createPaystackPayment: jest.fn(),
  verifyPaystackWebhookPayment: jest.fn(),
  getAll: jest.fn(),
  getOne: jest.fn(),
  refund: jest.fn(),
  getDisputes: jest.fn(),
  getPaymentMethodStats: jest.fn(),
};

describe('PaymentController (DEV-058)', () => {
  let controller: PaymentController;

  beforeEach(async () => {
    // clearAllMocks only resets call history, not mock implementations --
    // a mockRejectedValue/mockResolvedValue from one test was silently
    // still in effect for the next one. resetAllMocks clears both.
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        { provide: PaymentService, useValue: mockPaymentService },
        // Several routes here are @UseGuards(JwtAuthGuard, RolesGuard) --
        // JwtAuthGuard's own constructor (Reflector, JwtService,
        // UserService) gets resolved eagerly when this module compiles.
        // Neither was ever provided here, so this failed to compile with
        // a DI resolution error before a single test ran.
        { provide: JwtService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
  });

  // ── createPayment ────────────────────────────────────────────────────────────

  describe('createPayment — paystack', () => {
    it('wraps service result in { success: true, data, message }', async () => {
      mockPaymentService.createPaystackPayment.mockResolvedValue({
        authorizationUrl: 'https://paystack.com/pay/ref',
        reference: 'ref-123',
        payment: mockPayment,
      });

      const result = await controller.createPayment({
        method: 'paystack',
      } as any);

      expect(result.success).toBe(true);
      expect(result.data.authorizationUrl).toBe('https://paystack.com/pay/ref');
      expect(result.data.reference).toBe('ref-123');
      expect(result.message).toBeDefined();
    });

    it('propagates service exceptions — does not swallow errors', async () => {
      mockPaymentService.createPaystackPayment.mockRejectedValue(
        new Error('Business not found'),
      );

      await expect(
        controller.createPayment({ method: 'paystack' } as any),
      ).rejects.toThrow('Business not found');
    });
  });

  // createPayment no longer branches on dto.method at all -- it always
  // calls createPaystackPayment now (confirmed by reading the current
  // controller). PayPal support and the separate capturePayment step it
  // needed are both gone; there's nothing left to test here, so the
  // "paypal" and "capturePayment" blocks that used to cover them are
  // removed rather than kept testing methods that no longer exist.

  // ── verifyPayment ────────────────────────────────────────────────────────────

  describe('verifyPayment', () => {
    it('wraps verify result in { success: true, data, message }', async () => {
      mockPaymentService.verifyPaystackWebhookPayment.mockResolvedValue({
        payment: mockPayment,
        message: 'Payment already verified',
      });

      const result = await controller.verifyPayment('ref-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPayment);
      expect(result.message).toBe('Payment already verified');
    });

    it('propagates service exceptions', async () => {
      mockPaymentService.verifyPaystackWebhookPayment.mockRejectedValue(
        new Error('Payment already failed'),
      );

      await expect(controller.verifyPayment('ref-123')).rejects.toThrow(
        'Payment already failed',
      );
    });
  });
});
