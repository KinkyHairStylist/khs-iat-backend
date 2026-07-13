import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

/**
 * DEV-058: Controllers own { success, data } response shape.
 *
 * Verifies that the controller wraps service results correctly and
 * does NOT swallow errors — exceptions must propagate so NestJS
 * exception filters can return the right HTTP status code.
 */

const mockPayment = { id: 'pay-1', status: 'pending', amount: 5000 } as any;

const mockPaymentService = {
  createPayPalPayment: jest.fn(),
  createPaystackPayment: jest.fn(),
  capturePayment: jest.fn(),
  verifyPaystackWebhookPayment: jest.fn(),
  getAll: jest.fn(),
  getOne: jest.fn(),
  refund: jest.fn(),
  getDisputes: jest.fn(),
  deleteAllPayments: jest.fn(),
  getPaymentMethodStats: jest.fn(),
};

describe('PaymentController (DEV-058)', () => {
  let controller: PaymentController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [{ provide: PaymentService, useValue: mockPaymentService }],
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

  describe('createPayment — paypal', () => {
    it('wraps service result in { success: true, data, message }', async () => {
      mockPaymentService.createPayPalPayment.mockResolvedValue({
        approvalUrl: 'https://paypal.com/approve',
        orderId: 'order-abc',
        payment: mockPayment,
      });

      const result = await controller.createPayment({
        method: 'paypal',
      } as any);

      expect(result.success).toBe(true);
      expect(result.data.approvalUrl).toBe('https://paypal.com/approve');
      expect(result.data.orderId).toBe('order-abc');
    });
  });

  // ── capturePayment ───────────────────────────────────────────────────────────

  describe('capturePayment', () => {
    it('wraps capture result in { success: true, data, message }', async () => {
      mockPaymentService.capturePayment.mockResolvedValue({
        captureId: 'cap-1',
        status: 'COMPLETED',
        amount: 5000,
        businessId: 'biz-1',
      });

      const result = await controller.capturePayment('order-1');

      expect(result.success).toBe(true);
      expect(result.data.captureId).toBe('cap-1');
      expect(result.data.status).toBe('COMPLETED');
    });

    it('propagates service exceptions', async () => {
      mockPaymentService.capturePayment.mockRejectedValue(
        new Error('Capture failed'),
      );

      await expect(controller.capturePayment('order-1')).rejects.toThrow(
        'Capture failed',
      );
    });
  });

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
