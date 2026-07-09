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
  CaptureResponse,
  CreatePaymentDto,
  PaymentResponse,
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

interface PayPalAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly paypalBaseUrl: string;
  private readonly frontendUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly paystackBaseUrl: string;
  private readonly paystackAcessKey: string;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly businessWalletService: BusinessWalletService,
  ) {
    const paypalBaseUrl = process.env.PAYPAL_SANDBOX_URL;
    const frontendUrl = process.env.FRONTEND_URL;
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_SECRET_KEY!;

    const paystackAcessKey = process.env.PAYSTACK_SECRET_KEY!;
    const paystackBaseUrl = process.env.PAYSTACK_BASE_URL!;

    if (!paypalBaseUrl || !clientId || !clientSecret || !frontendUrl) {
      throw new Error('PAYMENT PAYPAL CREDENTIALS must be set');
    }

    // if (!paystackAcessKey || !paystackBaseUrl) {
    //   throw new Error('PAYMENT PAYSTACK CREDENTIALS must be set');
    // }

    // this.paypalBaseUrl = paypalBaseUrl;
    this.frontendUrl = frontendUrl;
    // this.clientId = clientId;
    this.clientSecret = clientSecret;

    this.paystackAcessKey = paystackAcessKey;
    this.paystackBaseUrl = paystackBaseUrl;
  }

  /**
   * Create PayPal Order (Step 1)
   * This creates the payment and returns an approval URL
   * User must visit this URL to approve the payment
   */
  async createPayPalPayment(dto: CreatePaymentDto): Promise<PaymentResponse> {
    const { businessId, senderId, business, amount, method, senderEmail } = dto;

    const businessExists = await this.businessRepo.findOne({
      where: { id: businessId },
    });

    if (!businessExists) {
      throw new BadRequestException('Business not found');
    }

    // Validation
    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid amount provided');
    }

    if (method !== 'paypal') {
      throw new BadRequestException(`Unsupported payment method: ${method}`);
    }

    try {
      // Get access token
      const accessToken = await this.getAccessToken();

      // Create PayPal Order using Orders API v2
      this.logger.log(
        `Creating PayPal order for business: ${businessExists.businessName}, amount: ${amount}`,
      );

      const orderResponse = await axios.post(
        `${this.paypalBaseUrl}/v2/checkout/orders`,
        {
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: {
                currency_code: 'USD',
                value: amount.toFixed(2),
              },
              description: `Payment from ${senderEmail} to ${business}`,
              custom_id: businessId, // ✅ Critical: This will be sent in webhook
              reference_id: businessId, // ✅ Backup reference
              invoice_id: `INV-${Date.now()}`, // Optional: unique invoice ID
            },
          ],
          application_context: {
            return_url: `${this.frontendUrl}/clients/complete-payment`,
            cancel_url: `${this.frontendUrl}/clients/complete-payment`,
            brand_name: business,
            landing_page: 'BILLING',
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const orderId = orderResponse.data.id;
      const approvalUrl = orderResponse.data.links.find(
        (link) => link.rel === 'approve',
      )?.href;

      if (!approvalUrl) {
        throw new InternalServerErrorException(
          'No approval URL received from PayPal',
        );
      }

      // Calculate PayPal fee (3.4% + $0.30)
      const fee = amount * 0.034 + 0.3;

      // Save payment in database with pending status
      const payment = this.paymentRepo.create({
        business,
        senderId,
        businessId,
        recipientId: businessExists.ownerId,
        amount,
        method,
        status: 'pending', // ✅ Starts as pending
        fee: Number(fee.toFixed(2)),
        gatewayTransactionId: orderId,
      } as Partial<Payment>);

      const savedPayment = await this.paymentRepo.save(payment);

      this.logger.log(`PayPal order created: ${orderId}`);

      return {
        payment: savedPayment,
        approvalUrl, // Frontend redirects user here
        orderId,
      };
    } catch (error) {
      // this.logger.error(
      //   'PayPal order creation failed:',
      //   error.response?.data || error.message,
      // );
      throw new InternalServerErrorException(
        `Payment failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Capture PayPal Payment (Step 2)
   * Called after user approves the payment
   * This triggers the webhook event
   */
  async capturePayment(orderId: string): Promise<CaptureResponse> {
    try {
      // Get access token
      const accessToken = await this.getAccessToken();

      this.logger.log(`Capturing PayPal order: ${orderId}`);

      // Capture the order
      const captureResponse = await axios.post(
        `${this.paypalBaseUrl}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const captureData = captureResponse.data;
      const purchaseUnit = captureData.purchase_units[0];
      const capture = purchaseUnit.payments.captures[0];

      // Extract data
      const captureId = capture.id;
      const status = capture.status; // COMPLETED, PENDING, etc.
      const amount = parseFloat(capture.amount.value);
      const businessId = purchaseUnit.custom_id || purchaseUnit.reference_id;

      this.logger.log(`Payment captured: ${captureId}, Status: ${status}`);

      // Update payment in database
      await this.paymentRepo.update(
        { gatewayTransactionId: orderId },
        {
          status: status.toLowerCase(),
          gatewayTransactionId: captureId, // Update with capture ID
        },
      );

      // ✅ After this, PayPal will send webhook event: PAYMENT.CAPTURE.COMPLETED
      // Your webhook handler will update the wallet automatically

      return {
        captureId,
        status,
        amount,
        businessId,
      };
    } catch (error) {
      this.logger.error(
        'PayPal capture failed:',
        error.response?.data || error.message,
      );

      // Update payment status to failed
      await this.paymentRepo.update(
        { gatewayTransactionId: orderId },
        { status: 'failed' },
      );

      throw new InternalServerErrorException(
        `Capture failed: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  /**
   * Create Paystack Order (Step 1)
   * This creates the payment and returns an approval URL
   * User must visit this URL to approve the payment
   */
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

    // Validation
    if (!senderEmail) {
      throw new BadRequestException('Provide your email');
    }

    const businessExists = await this.businessRepo.findOne({
      where: { id: businessId },
    });

    if (!businessExists) {
      throw new BadRequestException('Business not found');
    }

    // Validation
    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid amount provided');
    }

    if (method !== 'paystack') {
      throw new BadRequestException(`Unsupported payment method: ${method}`);
    }

    try {
      // Create PayStack Order using Orders API v2
      this.logger.log(
        `Creating PayStack order for business: ${businessExists.businessName}, amount: ${amount}`,
      );

      const response = await axios.post(
        `${this.paystackBaseUrl}/transaction/initialize`,
        {
          email: senderEmail,
          amount: amount * 100, // NGN in kobo
          callback_url: `${this.frontendUrl}/clients/complete-payment`,
        },
        {
          headers: { Authorization: `Bearer ${this.paystackAcessKey}` },
        },
      );

      const { authorization_url, reference } = response.data.data;

      if (!authorization_url) {
        throw new InternalServerErrorException(
          'No authorization URL received from PayStack',
        );
      }

      // Save payment in database with pending status
      const payment = this.paymentRepo.create({
        business,
        senderId,
        businessId,
        recipientId: businessExists.ownerId,
        amount,
        method,
        status: 'pending', // ✅ Starts as pending
        fee: 0,
        reason: description,
        gatewayTransactionId: reference,
      } as Partial<Payment>);

      const savedPayment = await this.paymentRepo.save(payment);

      this.logger.log(`PayStack order created: ${reference}`);

      return {
        payment: savedPayment,
        authorizationUrl: authorization_url, // Frontend redirects user here
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
  ): Promise<any> {
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

    // If payment already decided → return immediately
    if (existingPayment.status === 'successful' && transaction) {
      return {
        success: true,
        payment: existingPayment,
        message: 'Payment already verified',
      };
    }

    if (existingPayment.status === 'failed' && transaction) {
      return {
        success: false,
        payment: existingPayment,
        message: 'Payment already failed',
      };
    }

    // If status is pending → retry logic
    if (existingPayment.status === 'pending' && transaction) {
      if (retryCount >= maxRetries) {
        return {
          success: false,
          payment: existingPayment,
          message: 'Payment could not be verified after multiple attempts',
        };
      }

      // Wait 10 seconds before retry
      await new Promise((res) => setTimeout(res, 10000));

      return this.verifyPaystackWebhookPayment(
        reference,
        retryCount + 1,
        maxRetries,
      );
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

      this.logger.log(`Payment mark as Success: ${reference}`);

      return {
        success: false,
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
    // Validation
    if (!reference) {
      throw new BadRequestException('Provide a vaild transaction reference');
    }

    const existingPayment = await this.paymentRepo.findOne({
      where: { gatewayTransactionId: reference },
    });

    if (!existingPayment) {
      throw new InternalServerErrorException('No existing payment record ');
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
        uccess: false,
        payment: existingPayment,
        message: 'Payment already failed',
      };
    }

    try {
      // Verify PayStack reference
      this.logger.log(
        `Verifying PayStack transaction reference: ${reference}.`,
      );

      const verifyResponse = await axios.get(
        `${this.paystackBaseUrl}/transaction/verify/${reference}`,
        {
          headers: { Authorization: `Bearer ${this.paystackAcessKey}` },
        },
      );

      if (verifyResponse.data.status) {
        const { amount, channel, currency } = verifyResponse.data.data;

        // Mark payment as successful in your database

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

        this.logger.log(`Payment mark as Success: ${reference}`);
      } else {
        // Mark payment as successful in your database

        existingPayment.status = 'failed';

        await this.paymentRepo.save(existingPayment);

        this.logger.log(`Payment mark as failed: ${reference}`);
      }

      return {
        success: true,
        data: existingPayment,
        message: 'Payment Completed',
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

  // 🔍 Get one payment
  async getOne(id: string) {
    const payment = await this.paymentRepo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async refund(dto: RefundPaymentDto) {
    const { transactionId, amount, refundType, reason } = dto;

    const payment = await this.transactionRepo.findOne({
      where: { id: transactionId },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    // if (payment.method !== 'paypal') {
    //   throw new BadRequestException(
    //     'Refunds are only supported for PayPal payments.',
    //   );
    // }

    // await axios.post(
    //   `${process.env.PAYPAL_SANDBOX_URL}/v1/payments/sale/${payment.gatewayTransactionId}/refund`,
    //   { amount: { total: amount.toFixed(2), currency: 'USD' } },
    //   {
    //     auth: {
    //       username: process.env.PAYPAL_CLIENT_ID!,
    //       password: process.env.PAYPAL_SECRET_KEY!,
    //     },
    //   },
    // );

    payment.type = TransactionType.REFUND;
    payment.status = TransactionStatus.COMPLETED
    payment.reason = reason ?? "No reason provided";
    await this.transactionRepo.save(payment);

    return { message: 'Refund successful', payment };
  }

  async getDisputes() {
    return this.paymentRepo.find({ where: { status: 'disputed' } });
  }

  // 🗑️ Delete all payments
  async deleteAllPayments() {
    const result = await this.paymentRepo.clear();
    return { message: 'All payments deleted.', result };
  }

  /**
   * Get PayPal access token for API calls
   */
  private async getAccessToken(): Promise<string> {
    console.log('PayPal Config:', {
      clientId: this.clientId,
      clientSecret: this.clientSecret ? '***HIDDEN***' : 'MISSING',
      baseUrl: this.paypalBaseUrl,
    });

    try {
      const auth = Buffer.from(
        `${this.clientId}:${this.clientSecret}`,
      ).toString('base64');

      const response = await axios.post<PayPalAuthResponse>(
        `${this.paypalBaseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
          },
        },
      );

      return response.data.access_token;
    } catch (error) {
      if (error.response) {
        console.error('PayPal Error:', error.response.data);
        this.logger.error(
          'Failed to get PayPal access token',
          error.response.data,
        );
        throw new InternalServerErrorException('PayPal authentication failed');
      } else {
        console.error('Request Error:', error.message);
        throw new InternalServerErrorException('PayPal authentication failed');
      }
    }
  }

  async getPaymentMethodStats() {
    // Fetch all completed transactions grouped by method
    const raw = await this.transactionRepo
      .createQueryBuilder('t')
      .select('t.method', 'method')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(t.amount)', 'totalAmount')
      .where('t.status = :status', { status: 'completed' })
      .groupBy('t.method')
      .getRawMany();

    // Build default response for all methods (including those with 0)
    const methods = Object.values(PaymentMethod);

    const totalAmount = raw.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0);

    return methods.map((method) => {
      const record = raw.find((r) => r.method === method);

      const amount = record ? Number(record.totalAmount) : 0;
      const count = record ? Number(record.count) : 0;

      return {
        method,
        amount,
        count,
        percentage: totalAmount === 0 ? 0 : Number(((amount / totalAmount) * 100).toFixed(2)),
      };
    });
  }
}
