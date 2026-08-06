import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import {
  CreatePaymentDto,
  PayStackPaymentResponse,
} from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import axios from 'axios';
import { Business } from 'src/business/entities/business.entity';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import {
  PaymentMethod,
  Transaction,
  TransactionStatus,
  TransactionType,
} from 'src/business/entities/transaction.entity';
import { WalletCurrency } from './enums/wallet.enum';
import {
  StripePaymentIntent,
  StripeEscrowStatus,
} from 'src/payment/entities/stripe-payment-intent.entity';
import { StripeService } from 'src/payment/stripe.service';
import { Appointment } from 'src/business/entities/appointment.entity';
import {
  Refund,
  RefundStatus,
  RefundMethod,
} from 'src/user/user_entities/refund.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly frontendUrl: string;
  private readonly paystackBaseUrl: string;
  private readonly paystackAcessKey: string;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(StripePaymentIntent)
    private readonly stripePaymentIntentRepo: Repository<StripePaymentIntent>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    private readonly businessWalletService: BusinessWalletService,
    private readonly stripeService: StripeService,
  ) {
    this.frontendUrl = process.env.FRONTEND_URL ?? '';
    this.paystackAcessKey = process.env.PAYSTACK_SECRET_KEY!;
    this.paystackBaseUrl = process.env.PAYSTACK_BASE_URL!;
  }

  async createPaystackPayment(
    dto: CreatePaymentDto,
  ): Promise<PayStackPaymentResponse> {
    const {
      senderId,
      businessId,
      senderEmail,
      description,
      business,
      amount,
      method,
    } = dto;

    if (!senderEmail) {
      throw new BadRequestException('Provide your email');
    }

    const businessExists = await this.businessRepo.findOne({
      where: { id: businessId },
    });

    if (!businessExists) {
      throw new BadRequestException('Business not found');
    }

    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid amount provided');
    }

    if (method !== 'paystack') {
      throw new BadRequestException(`Unsupported payment method: ${method}`);
    }

    try {
      this.logger.log(
        `Creating Paystack order for business: ${businessExists.businessName}, amount: ${amount}`,
      );

      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          email: senderEmail,
          amount: amount * 100,
          callback_url: `${this.frontendUrl}/clients/complete-payment`,
        },
        {
          headers: { Authorization: `Bearer ${this.paystackAcessKey}` },
        },
      );

      const { authorization_url, reference } = response.data.data;

      if (!authorization_url) {
        throw new InternalServerErrorException(
          'No authorization URL received from Paystack',
        );
      }

      const payment = this.paymentRepo.create({
        business,
        senderId,
        businessId,
        recipientId: businessExists.ownerId,
        amount,
        method,
        status: 'pending',
        fee: 0,
        reason: description,
        gatewayTransactionId: reference,
      } as Partial<Payment>);

      const savedPayment = await this.paymentRepo.save(payment);

      this.logger.log(`Paystack order created: ${reference}`);

      return {
        payment: savedPayment,
        authorizationUrl: authorization_url,
        reference,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Payment failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  async verifyPaystackWebhookPayment(
    reference: string,
    retryCount = 0,
    maxRetries = 6, // 6 retries → 60 seconds max
  ): Promise<{ payment: Payment; message: string }> {
    if (!reference) {
      throw new BadRequestException('Provide a valid transaction reference');
    }

    const existingPayment = await this.paymentRepo.findOne({
      where: { gatewayTransactionId: reference },
    });

    if (!existingPayment) {
      throw new InternalServerErrorException('No existing payment record');
    }

    const transaction = await this.transactionRepo.findOne({
      where: { referenceId: existingPayment.gatewayTransactionId },
    });

    if (existingPayment.status === 'successful' && transaction) {
      return { payment: existingPayment, message: 'Payment already verified' };
    }

    if (existingPayment.status === 'failed' && transaction) {
      throw new BadRequestException('Payment already failed');
    }

    if (existingPayment.status === 'pending' && transaction) {
      if (retryCount >= maxRetries) {
        throw new BadRequestException('Payment could not be verified after multiple attempts');
      }

      await new Promise((res) => setTimeout(res, 10000));

      return this.verifyPaystackWebhookPayment(reference, retryCount + 1, maxRetries);
    }

    if (!transaction) {
      await this.businessWalletService.addFunds({
        amount: existingPayment.amount * 100,
        businessId: existingPayment.businessId,
        description:
          existingPayment.reason ||
          `Payment from Customer: ${existingPayment.sender.email}`,
        type: TransactionType.EARNING,
        referenceId: reference,
        mode: existingPayment.mode ?? 'card',
        currency: existingPayment.currency ?? WalletCurrency.NGN,
        method: PaymentMethod.PAYSTACK,
        recipientId: existingPayment.recipientId,
        senderId: existingPayment.senderId,
      });

      this.logger.log(`Payment marked as Success: ${reference}`);

      return { payment: existingPayment, message: 'Payment transaction recorded successfully' };
    }

    throw new InternalServerErrorException('Unknown payment status');
  }

  async verifyPaystackPayment(reference: string): Promise<{ payment: Payment; message: string }> {
    if (!reference) {
      throw new BadRequestException('Provide a valid transaction reference');
    }

    const existingPayment = await this.paymentRepo.findOne({
      where: { gatewayTransactionId: reference },
    });

    if (!existingPayment) {
      throw new InternalServerErrorException('No existing payment record');
    }

    if (existingPayment.status === 'successful') {
      return { payment: existingPayment, message: 'Payment already verified' };
    }

    if (existingPayment.status === 'failed') {
      throw new BadRequestException('Payment already failed');
    }

    try {
      this.logger.log(
        `Verifying Paystack transaction reference: ${reference}.`,
      );

      const verifyResponse = await axios.get(
        `${this.paystackBaseUrl}/transaction/verify/${reference}`,
        {
          headers: { Authorization: `Bearer ${this.paystackAcessKey}` },
        },
      );

      if (verifyResponse.data.status) {
        const { amount, channel, currency } = verifyResponse.data.data;

        existingPayment.status = 'successful';
        existingPayment.mode = channel;
        existingPayment.currency = currency;

        await this.paymentRepo.save(existingPayment);

        await this.businessWalletService.addFunds({
          amount,
          businessId: existingPayment.businessId,
          description:
            existingPayment.reason ||
            `Payment from Customer: ${existingPayment.sender.email}`,
          type: TransactionType.EARNING,
          referenceId: reference,
          mode: channel,
          currency,
          method: PaymentMethod.PAYSTACK,
          recipientId: existingPayment.recipientId,
          senderId: existingPayment.senderId,
        });

        this.logger.log(`Payment marked as Success: ${reference}`);
      } else {
        existingPayment.status = 'failed';
        await this.paymentRepo.save(existingPayment);
        this.logger.log(`Payment marked as failed: ${reference}`);
      }

      return { payment: existingPayment, message: 'Payment Completed' };
    } catch (error) {
      if (error.response) {
        this.logger.error('Paystack verification error', error.response.data);
        throw new BadRequestException(error.response.data.message);
      }
      this.logger.error('Network error verifying Paystack', error.message);
      throw new InternalServerErrorException('Could not verify payment');
    }
  }

  async getAll() {
    const payments = await this.paymentRepo.find();

    return payments.map((p) => ({
      ...p,
      date: p.createdAt.toISOString().split('T')[0],
      time: p.createdAt.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    }));
  }

  async getOne(id: string) {
    const payment = await this.paymentRepo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async refund(dto: RefundPaymentDto) {
    const { transactionId, reason } = dto;

    const payment = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    payment.type = TransactionType.REFUND;
    payment.status = TransactionStatus.COMPLETED;
    payment.reason = reason ?? 'No reason provided';
    await this.transactionRepo.save(payment);

    return { message: 'Refund successful', payment };
  }

  async getDisputes() {
    return this.paymentRepo.find({ where: { status: 'disputed' } });
  }

  // Manually release Stripe escrow for a booking — support override for
  // cases where the automatic completion trigger
  // (BusinessService.completeBooking) didn't fire or needs correcting.
  async releaseStripeEscrow(orderId: string) {
    const heldPaymentIntents = await this.stripePaymentIntentRepo.find({
      where: { orderId, status: StripeEscrowStatus.HELD },
    });

    if (heldPaymentIntents.length === 0) {
      throw new NotFoundException(
        `No held Stripe escrow found for order ${orderId}`,
      );
    }

    const appointment = await this.appointmentRepo.findOne({
      where: { orderId },
      relations: ['business', 'business.owner'],
    });
    if (!appointment) {
      throw new NotFoundException(`No appointment found for order ${orderId}`);
    }

    const businessId = appointment.business.id;
    const ownerId = appointment.business.owner?.id;
    if (!businessId || !ownerId) {
      throw new BadRequestException('Business or owner not found for this booking');
    }

    const released: string[] = [];
    for (const spi of heldPaymentIntents) {
      try {
        await this.businessWalletService.getWalletByBusinessId(businessId);
      } catch {
        await this.businessWalletService.createWalletForBusiness({
          businessId,
          ownerId,
          currency: WalletCurrency.USD,
          description: 'Business wallet - auto-created from booking',
        });
      }

      await this.businessWalletService.addFunds({
        businessId,
        recipientId: ownerId,
        senderId: spi.userId,
        amount: spi.bookingAmount,
        type: TransactionType.EARNING,
        description: `Manual escrow release for order ${orderId}`,
        referenceId: spi.stripePaymentIntentId,
        currency: WalletCurrency.USD,
        mode: 'Web',
        method: PaymentMethod.STRIPE,
      });

      spi.status = StripeEscrowStatus.RELEASED;
      spi.releasedAt = new Date();
      await this.stripePaymentIntentRepo.save(spi);
      released.push(spi.stripePaymentIntentId);
    }

    return { message: 'Escrow released successfully', released };
  }

  // Manually refund Stripe escrow for a booking — support override for
  // cases needing a refund outside the normal cancellation flow.
  async refundStripeEscrow(orderId: string, reason?: string) {
    const heldPaymentIntents = await this.stripePaymentIntentRepo.find({
      where: { orderId, status: StripeEscrowStatus.HELD },
    });

    if (heldPaymentIntents.length === 0) {
      throw new NotFoundException(
        `No held Stripe escrow found for order ${orderId}`,
      );
    }

    const refunded: string[] = [];
    for (const spi of heldPaymentIntents) {
      const stripeRefund = await this.stripeService.createRefund({
        paymentIntentId: spi.stripePaymentIntentId,
      });

      spi.status = StripeEscrowStatus.REFUNDED;
      spi.refundedAt = new Date();
      await this.stripePaymentIntentRepo.save(spi);

      const debitTx = await this.transactionRepo.findOne({
        where: {
          referenceId: spi.stripePaymentIntentId,
          service: 'Booking',
          method: PaymentMethod.STRIPE,
        },
      });

      if (debitTx) {
        await this.refundRepo.save(
          this.refundRepo.create({
            transactionId: debitTx.id,
            userId: spi.userId,
            amount: spi.amount,
            currency: spi.currency.toUpperCase(),
            reason: reason || 'Admin-initiated refund',
            adminNote: `Stripe refund ${stripeRefund.id}`,
            status: RefundStatus.PROCESSED,
            refundMethod: RefundMethod.CARD_REFUND,
          }),
        );
      }

      refunded.push(spi.stripePaymentIntentId);
    }

    return { message: 'Escrow refunded successfully', refunded };
  }

  async deleteAllPayments() {
    const result = await this.paymentRepo.clear();
    return { message: 'All payments deleted.', result };
  }

  async getPaymentMethodStats() {
    const raw = await this.transactionRepo
      .createQueryBuilder('t')
      .select('t.method', 'method')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(t.amount)', 'totalAmount')
      .where('t.status = :status', { status: 'completed' })
      .groupBy('t.method')
      .getRawMany();

    const methods = Object.values(PaymentMethod);
    const totalAmount = raw.reduce(
      (sum, r) => sum + Number(r.totalAmount || 0),
      0,
    );

    return methods.map((method) => {
      const record = raw.find((r) => r.method === method);
      const amount = record ? Number(record.totalAmount) : 0;
      const count = record ? Number(record.count) : 0;

      return {
        method,
        amount,
        count,
        percentage:
          totalAmount === 0
            ? 0
            : Number(((amount / totalAmount) * 100).toFixed(2)),
      };
    });
  }
}
