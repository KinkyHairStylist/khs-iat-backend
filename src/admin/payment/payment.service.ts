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

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly frontendUrl: string;
  private readonly paystackBaseUrl: string;
  private readonly paystackAccessKey: string;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly businessWalletService: BusinessWalletService,
  ) {
    const frontendUrl = process.env.FRONTEND_URL;
    const paystackAccessKey = process.env.PAYSTACK_SECRET_KEY;
    const paystackBaseUrl = process.env.PAYSTACK_BASE_URL;

    if (!paystackAccessKey || !paystackBaseUrl || !frontendUrl) {
      throw new Error('PAYSTACK credentials must be set');
    }

    this.frontendUrl = frontendUrl;
    this.paystackAccessKey = paystackAccessKey;
    this.paystackBaseUrl = paystackBaseUrl;
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
        `Creating Paystack payment for business: ${businessExists.businessName}, amount: ${amount}`,
      );

      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          email: senderEmail,
          amount: amount * 100, // kobo
          callback_url: `${this.frontendUrl}/clients/complete-payment`,
        },
        {
          headers: { Authorization: `Bearer ${this.paystackAccessKey}` },
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

      this.logger.log(`Paystack payment initialized: ${reference}`);

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

  async verifyPaystackWebhookPayment(reference: string): Promise<any> {
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
      return {
        success: true,
        payment: existingPayment,
        message: 'Payment already verified',
      };
    }

    if (existingPayment.status === 'failed') {
      return {
        success: false,
        payment: existingPayment,
        message: 'Payment already failed',
      };
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

      this.logger.log(`Payment marked as successful: ${reference}`);

      return {
        success: true,
        payment: existingPayment,
        message: 'Payment transaction recorded successfully',
      };
    }

    return {
      success: false,
      payment: existingPayment,
      message: 'Unknown payment status',
    };
  }

  async verifyPaystackPayment(reference: string): Promise<any> {
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
      return {
        success: true,
        payment: existingPayment,
        message: 'Payment already verified',
      };
    }

    if (existingPayment.status === 'failed') {
      return {
        success: false,
        payment: existingPayment,
        message: 'Payment already failed',
      };
    }

    try {
      this.logger.log(
        `Verifying Paystack transaction reference: ${reference}.`,
      );

      const verifyResponse = await axios.get(
        `${this.paystackBaseUrl}/transaction/verify/${reference}`,
        {
          headers: { Authorization: `Bearer ${this.paystackAccessKey}` },
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

        this.logger.log(`Payment marked as successful: ${reference}`);
      } else {
        existingPayment.status = 'failed';
        await this.paymentRepo.save(existingPayment);
        this.logger.log(`Payment marked as failed: ${reference}`);
      }

      return {
        success: true,
        data: existingPayment,
        message: 'Payment completed',
      };
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
    const { transactionId, amount, reason } = dto;

    const payment = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    try {
      await axios.post(
        `${this.paystackBaseUrl}/refund`,
        {
          transaction: payment.referenceId,
          amount: amount ? amount * 100 : undefined, // kobo; omit for full refund
        },
        {
          headers: { Authorization: `Bearer ${this.paystackAccessKey}` },
        },
      );
    } catch (error) {
      this.logger.error('Paystack refund failed', error.response?.data || error.message);
      throw new InternalServerErrorException(
        `Refund failed: ${error.response?.data?.message || error.message}`,
      );
    }

    payment.type = TransactionType.REFUND;
    payment.status = TransactionStatus.COMPLETED;
    payment.reason = reason ?? 'No reason provided';
    await this.transactionRepo.save(payment);

    return payment;
  }

  async getDisputes() {
    return this.paymentRepo.find({ where: { status: 'disputed' } });
  }

  async deleteAllPayments() {
    await this.paymentRepo.clear();
    return;
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
