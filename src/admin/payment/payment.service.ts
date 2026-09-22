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
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from 'src/utils/enum';
import { EmailService } from 'src/email/email.service';
import { TemplateService } from 'src/email/template.service';

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
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
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
        SlackService.notify({
          node: SlackNode.PAYMENT,
          provider: SlackProvider.SYSTEM,
          severity: SlackSeverity.INFO,
          type: SlackEventType.PAYMENT_FAILURE,
          trigger: `Paystack verification failed (${reference})`,
          body: `Paystack payment verification returned status: false.
• Reference: ${reference}`,
        });
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

    // Ledger-only — this flips the Transaction's own type/status but makes
    // no actual gateway call, unlike refundStripeEscrow below. Flagging via
    // Slack since nothing else here signals that money didn't really move.
    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.PAYMENT_FAILURE,
      trigger: `Ledger-only refund recorded (${transactionId})`,
      body: `A transaction was marked REFUND/COMPLETED with no accompanying gateway call — this only updates the ledger, it does not move any real money.
• Transaction: ${transactionId}
• Reason: ${payment.reason}`,
    });

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

    // An admin-support override that bypasses BusinessService.completeBooking
    // entirely — worth its own trail since it's an untracked path to the
    // same money movement.
    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.STRIPE,
      severity: SlackSeverity.INFO,
      type: SlackEventType.ADMIN_ACTION,
      trigger: `Escrow manually released for order ${orderId}`,
      body: `An admin manually released Stripe escrow to the merchant's wallet, bypassing the normal completeBooking flow.
• Order: ${orderId}
• Business: ${appointment.business?.businessName || businessId}
• Payment intents released: ${released.length}`,
    });

    return { message: 'Escrow released successfully', released };
  }

  // Manually refund Stripe escrow for a booking — support override for
  // cases needing a refund outside the normal cancellation flow.
  // Refund policy: the customer gets back the service amount minus KHS's
  // own platform fee minus Stripe's real processing fee for that specific
  // charge (looked up from Stripe, not estimated). 0 or negative means
  // nothing is left to refund after those deductions.
  private async calculateStripeRefundAmountCents(
    spi: StripePaymentIntent,
  ): Promise<number> {
    if (!spi.stripeChargeId) {
      throw new BadRequestException(
        `Stripe charge ID missing for payment intent ${spi.stripePaymentIntentId} — cannot compute refund`,
      );
    }

    const stripeFeeCents = await this.stripeService.getChargeFee(
      spi.stripeChargeId,
    );
    const bookingAmountCents = Math.round(spi.bookingAmount * 100);
    const platformFeeCents = Math.round(spi.feeAmount * 100);

    return bookingAmountCents - platformFeeCents - stripeFeeCents;
  }

  async refundStripeEscrow(orderId: string, reason?: string) {
    const heldPaymentIntents = await this.stripePaymentIntentRepo.find({
      where: { orderId, status: StripeEscrowStatus.HELD },
    });

    if (heldPaymentIntents.length === 0) {
      throw new NotFoundException(
        `No held Stripe escrow found for order ${orderId}`,
      );
    }

    // Pre-flight: compute every refund amount before refunding anything,
    // so a blocked one doesn't leave the order in a half-refunded state.
    const refundPlans: { spi: StripePaymentIntent; refundAmountCents: number }[] = [];
    for (const spi of heldPaymentIntents) {
      const refundAmountCents = await this.calculateStripeRefundAmountCents(spi);
      if (refundAmountCents <= 0) {
        throw new BadRequestException(
          `Cannot refund: after deducting the platform fee and Stripe's processing fee, no refundable amount remains for order ${orderId}.`,
        );
      }
      refundPlans.push({ spi, refundAmountCents });
    }

    const refunded: string[] = [];
    for (const { spi, refundAmountCents } of refundPlans) {
      const stripeRefund = await this.stripeService.createRefund({
        paymentIntentId: spi.stripePaymentIntentId,
        amount: refundAmountCents,
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
            amount: refundAmountCents / 100,
            currency: spi.currency.toUpperCase(),
            reason: reason || 'Admin-initiated refund',
            adminNote: `Stripe refund ${stripeRefund.id} (platform fee + Stripe processing fee withheld)`,
            status: RefundStatus.PROCESSED,
            refundMethod: RefundMethod.CARD_REFUND,
          }),
        );
      }

      refunded.push(spi.stripePaymentIntentId);
    }

    const totalRefundedCents = refundPlans.reduce((sum, p) => sum + p.refundAmountCents, 0);
    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.STRIPE,
      severity: SlackSeverity.INFO,
      type: SlackEventType.PAYMENT_FAILURE,
      trigger: `Admin refund issued for order ${orderId}`,
      body: `An admin issued a refund for a held Stripe escrow booking.
• Order: ${orderId}
• Amount: $${(totalRefundedCents / 100).toFixed(2)}
• Reason: ${reason || 'Admin-initiated refund'}`,
    });

    const appointment = await this.appointmentRepo.findOne({
      where: { orderId },
      relations: ['client', 'business'],
    });
    if (appointment?.client?.email) {
      const frontendUrl = this.frontendUrl || 'https://kinkyhairstylists.com';
      const message = `Your booking with ${appointment.business?.businessName || 'the salon'} (order ${orderId}) has been refunded $${(totalRefundedCents / 100).toFixed(2)}.${reason ? ` Reason: ${reason}` : ''}`;
      const html = this.templateService.render('communication-bulk', {
        businessName: appointment.business?.businessName || 'Kinky Hairstylist',
        subject: 'Your booking has been refunded',
        clientName: appointment.client.firstName || 'there',
        message,
        closingRemarks: null,
        frontendUrl,
        year: new Date().getFullYear(),
      });
      this.emailService.sendEmail(appointment.client.email, 'Your booking has been refunded', message, html);
    }

    return { message: 'Escrow refunded successfully', refunded };
  }

  // A payment is a customer paying for something: the Debit rows of the ledger. The other rows
  // (fees, the salon's matching earning, refunds, withdrawals) are the other side of the same
  // money, so counting them too would count it several times.
  static readonly ABANDONED_AFTER_HOURS = 24;

  // The headline numbers for the payments page. "Waiting" is a payment that was started
  // recently and not paid yet; "abandoned" was started more than ABANDONED_AFTER_HOURS ago and
  // never paid.
  async getPaymentsOverview(now: Date = new Date()) {
    const cutoff = new Date(now.getTime() - PaymentService.ABANDONED_AFTER_HOURS * 3_600_000);

    const byStatus = await this.transactionRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'amount')
      .where('t.type = :type', { type: TransactionType.DEBIT })
      .groupBy('t.status')
      .getRawMany();

    const oldPending = await this.transactionRepo
      .createQueryBuilder('t')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'amount')
      .where('t.type = :type', { type: TransactionType.DEBIT })
      .andWhere('t.status = :status', { status: TransactionStatus.PENDING })
      .andWhere('t.createdAt < :cutoff', { cutoff })
      .getRawOne();

    const totals = (statuses: string[]) =>
      byStatus
        .filter((r) => statuses.includes(r.status))
        .reduce(
          (sum, r) => ({
            count: sum.count + Number(r.count || 0),
            amount: sum.amount + Number(r.amount || 0),
          }),
          { count: 0, amount: 0 },
        );

    const pending = totals([TransactionStatus.PENDING]);
    const abandoned = {
      count: Number(oldPending?.count || 0),
      amount: Number(oldPending?.amount || 0),
    };
    const round = (n: number) => Math.round(n * 100) / 100;

    return {
      received: { ...totals([TransactionStatus.COMPLETED]), amount: round(totals([TransactionStatus.COMPLETED]).amount) },
      waiting: { count: pending.count - abandoned.count, amount: round(pending.amount - abandoned.amount) },
      abandoned: { count: abandoned.count, amount: round(abandoned.amount) },
      failed: {
        ...totals([TransactionStatus.FAILED, TransactionStatus.CANCELLED]),
        amount: round(totals([TransactionStatus.FAILED, TransactionStatus.CANCELLED]).amount),
      },
      totalPayments: byStatus.reduce((sum, r) => sum + Number(r.count || 0), 0),
      abandonedAfterHours: PaymentService.ABANDONED_AFTER_HOURS,
      methods: await this.getPaymentMethodStats(),
    };
  }

  // What customers actually paid, by method: completed payments only.
  async getPaymentMethodStats() {
    const raw = await this.transactionRepo
      .createQueryBuilder('t')
      .select('t.method', 'method')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(t.amount)', 'totalAmount')
      .where('t.status = :status', { status: TransactionStatus.COMPLETED })
      .andWhere('t.type = :type', { type: TransactionType.DEBIT })
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
