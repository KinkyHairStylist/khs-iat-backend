import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import { PaymentService } from 'src/admin/payment/payment.service';

// PayPal Webhook Event Types
export enum PayPalWebhookEvent {
  PAYMENT_CAPTURE_COMPLETED = 'PAYMENT.CAPTURE.COMPLETED',
  PAYMENT_CAPTURE_DENIED = 'PAYMENT.CAPTURE.DENIED',
  PAYMENT_CAPTURE_PENDING = 'PAYMENT.CAPTURE.PENDING',
  PAYMENT_CAPTURE_REFUNDED = 'PAYMENT.CAPTURE.REFUNDED',
  CHECKOUT_ORDER_COMPLETED = 'CHECKOUT.ORDER.COMPLETED',
  CHECKOUT_ORDER_APPROVED = 'CHECKOUT.ORDER.APPROVED',
}

interface PayPalWebhookPayload {
  id: string;
  event_type: string;
  create_time: string;
  resource_type: string;
  resource: any;
  summary: string;
}

interface PayPalAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly paypalBaseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookId: string;
  private readonly paystackAcessKey: string;

  constructor(
    private readonly walletService: BusinessWalletService,
    private readonly paymentsService: PaymentService,
  ) {
    const paypalBaseUrl = process.env.PAYPAL_SANDBOX_URL!;
    const clientId = process.env.PAYPAL_CLIENT_ID!;
    const clientSecret = process.env.PAYPAL_SECRET_KEY!;
    const webhookId = process.env.PAYPAL_WEBHOOK_ID!;

    const paystackAcessKey = process.env.PAYSTACK_SECRET_KEY!;

    if (!paypalBaseUrl || !clientId || !clientSecret || !webhookId) {
      throw new Error('PAYPAL CREDENTIALS must be set');
    }

    if (!paystackAcessKey) {
      throw new Error('PAYMENT PAYSTACK CREDENTIALS must be set');
    }

    this.paypalBaseUrl = paypalBaseUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.webhookId = webhookId;

    this.paystackAcessKey = paystackAcessKey;
  }

  /**
   * Verify PayPal webhook signature
   * This ensures the webhook is genuinely from PayPal
   */
  async verifyWebhookSignature(headers: any, body: any): Promise<boolean> {
    try {
      const authToken = await this.getAccessToken();

      const verificationData = {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: this.webhookId,
        webhook_event: body,
      };

      const response = await axios.post(
        `${this.paypalBaseUrl}/v1/notifications/verify-webhook-signature`,
        verificationData,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      return response.data.verification_status === 'SUCCESS';
    } catch (error) {
      this.logger.error('Webhook verification failed', error);
      return false;
    }
  }

  /**
   * Get PayPal access token for API calls
   */
  private async getAccessToken(): Promise<string> {
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
      this.logger.error('Failed to get PayPal access token', error);
      throw new InternalServerErrorException('PayPal authentication failed');
    }
  }

  /**
   * Handle incoming PayPal webhook
   */
  async handleWebhook(
    headers: any,
    payload: PayPalWebhookPayload,
  ): Promise<void> {
    // Verify webhook authenticity
    const isValid = await this.verifyWebhookSignature(headers, payload);

    if (!isValid) {
      this.logger.warn('Invalid webhook signature received');
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Processing webhook event: ${payload.event_type}`);

    // Route to appropriate handler based on event type
    switch (payload.event_type) {
      case PayPalWebhookEvent.PAYMENT_CAPTURE_COMPLETED:
        await this.handlePaymentCaptureCompleted(payload);
        break;

      case PayPalWebhookEvent.CHECKOUT_ORDER_COMPLETED:
        await this.handleCheckoutOrderCompleted(payload);
        break;

      case PayPalWebhookEvent.PAYMENT_CAPTURE_REFUNDED:
        await this.handlePaymentRefunded(payload);
        break;

      case PayPalWebhookEvent.PAYMENT_CAPTURE_DENIED:
        await this.handlePaymentDenied(payload);
        break;

      case PayPalWebhookEvent.PAYMENT_CAPTURE_PENDING:
        await this.handlePaymentPending(payload);
        break;

      default:
        this.logger.log(`Unhandled webhook event type: ${payload.event_type}`);
    }
  }

  /**
   * Create webhook programmatically and get webhook ID
   * Call this once to set up your webhook in PayPal
   */
  async createWebhook(webhookUrl: string): Promise<string> {
    try {
      const authToken = await this.getAccessToken();

      const response = await axios.post(
        `${this.paypalBaseUrl}/v1/notifications/webhooks`,
        {
          url: webhookUrl,
          event_types: [
            { name: 'PAYMENT.CAPTURE.COMPLETED' },
            { name: 'PAYMENT.CAPTURE.DENIED' },
            { name: 'PAYMENT.CAPTURE.PENDING' },
            { name: 'PAYMENT.CAPTURE.REFUNDED' },
            { name: 'CHECKOUT.ORDER.COMPLETED' },
            { name: 'CHECKOUT.ORDER.APPROVED' },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      this.logger.log(`✅ Webhook created successfully`);
      this.logger.log(`Webhook ID: ${response.data.id}`);
      this.logger.log(`Webhook URL: ${response.data.url}`);

      return response.data.id;
    } catch (error) {
      if (error.response?.data) {
        this.logger.error('PayPal API Error:', error.response.data);
      }
      this.logger.error('Failed to create webhook', error);
      throw new InternalServerErrorException('Failed to create PayPal webhook');
    }
  }

  /**
   * update webhook programmatically and get webhook ID
   * Call this once to set up your webhook in PayPal
   */
  async updateWebhook(): Promise<string> {
    try {
      const authToken = await this.getAccessToken();

      const updates = [
        {
          op: 'replace',
          path: '/url',
          value: 'https://15f5db903688.ngrok-free.app/api/webhooks/paypal',
        },
      ];

      const response = await axios.patch(
        `${this.paypalBaseUrl}/v1/notifications/webhooks/${this.webhookId}`,

        updates,

        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      this.logger.log(`✅ Webhook updated successfully`);
      this.logger.log(`Update Webhook DATA: ${response.data}`);

      return response.data;
    } catch (error) {
      if (error.response?.data) {
        this.logger.error('PayPal API Error:', error.response.data);
      }
      this.logger.error('Failed to create webhook', error);
      throw new InternalServerErrorException('Failed to create PayPal webhook');
    }
  }

  async listWebhooks(): Promise<any[]> {
    try {
      const authToken = await this.getAccessToken();

      console.log('PAYPAL ACCESS TOKEN:', authToken);

      const response = await axios.get(
        `${this.paypalBaseUrl}/v1/notifications/webhooks`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      this.logger.log(`Found ${response.data.webhooks?.length || 0} webhooks`);
      this.logger.log(`Webhooks List: ${response.data.webhooks} webhooks`);
      return response.data.webhooks || [];
    } catch (error) {
      this.logger.error('Failed to list webhooks', error);
      throw new InternalServerErrorException('Failed to list PayPal webhooks');
    }
  }

  // PAYSTACK
  /**
   * Handle incoming PayStack webhook
   */
  async handlePayStackWebhook(
    signature: string,
    bodyPayload: any,
  ): Promise<any> {
    // Verify webhook authenticity
    const rawBody =
      bodyPayload instanceof Buffer
        ? bodyPayload
        : Buffer.from(JSON.stringify(bodyPayload));

    const hash = crypto
      .createHmac('sha512', this.paystackAcessKey)
      .update(rawBody)
      .digest('hex');
    if (hash !== signature) {
      throw new BadRequestException('Invalid Paystack signature');
    }

    const event = bodyPayload.event;
    const data = bodyPayload.data;

    if (event === 'charge.success') {
      const reference = data.reference;

      const result =
        await this.paymentsService.verifyPaystackPayment(reference);
      console.log('✅ Payment verified via webhook:', reference);

      return result;
    }
  }

  /**
   * Handle completed payment capture
   */
  private async handlePaymentCaptureCompleted(
    payload: PayPalWebhookPayload,
  ): Promise<void> {
    try {
      const resource = payload.resource;
      const amount = parseFloat(resource.amount.value);
      const currency = resource.amount.currency_code;
      const paypalTransactionId = resource.id;

      // Extract businessId from custom_id or invoice_id
      // You should pass businessId when creating the PayPal order
      const businessId = resource.custom_id || resource.invoice_id;

      if (!businessId) {
        this.logger.error('No businessId found in PayPal webhook payload');
        throw new BadRequestException('Missing business reference');
      }

      // Get wallet for the business
      const wallet = await this.walletService.getWalletByBusinessId(businessId);

      // Add funds to wallet using the wallet service
      // await this.walletService.addFunds({
      //   businessId: wallet.businessId,
      //   amount: amount,
      //   type: 'credit',
      //   description: `PayPal payment received - ${resource.status}`,
      //   referenceId: paypalTransactionId,
      // });

      this.logger.log(
        `Payment completed: ${amount} ${currency} added to business ${businessId}`,
      );
    } catch (error) {
      this.logger.error('Error handling payment capture completed', error);
      throw error;
    }
  }

  /**
   * Handle completed checkout order
   */
  private async handleCheckoutOrderCompleted(
    payload: PayPalWebhookPayload,
  ): Promise<void> {
    try {
      const resource = payload.resource;
      const purchaseUnit = resource.purchase_units?.[0];

      if (!purchaseUnit) {
        this.logger.warn('No purchase unit found in order');
        return;
      }

      const amount = parseFloat(purchaseUnit.amount.value);
      const currency = purchaseUnit.amount.currency_code;
      const orderId = resource.id;
      const businessId = purchaseUnit.custom_id || purchaseUnit.reference_id;

      if (!businessId) {
        this.logger.error('No businessId found in order payload');
        return;
      }

      const wallet = await this.walletService.getWalletByBusinessId(businessId);

      // await this.walletService.addFunds({
      //   businessId: wallet.businessId,
      //   amount: amount,
      //   type: 'credit',
      //   description: `PayPal order completed - Order ID: ${orderId}`,
      //   referenceId: orderId,
      // });

      this.logger.log(
        `Order completed: ${amount} ${currency} added to business ${businessId}`,
      );
    } catch (error) {
      this.logger.error('Error handling checkout order completed', error);
      throw error;
    }
  }

  /**
   * Handle payment refund
   */
  private async handlePaymentRefunded(
    payload: PayPalWebhookPayload,
  ): Promise<void> {
    try {
      const resource = payload.resource;
      const amount = parseFloat(resource.amount.value);
      const refundId = resource.id;

      // Get businessId from links or custom field
      const businessId = resource.custom_id || resource.invoice_id;

      if (!businessId) {
        this.logger.error('No businessId found for refund');
        return;
      }

      const wallet = await this.walletService.getWalletByBusinessId(businessId);

      // Deduct refunded amount from wallet
      // await this.walletService.deductFunds({
      //   businessId: wallet.businessId,
      //   amount: amount,
      //   type: 'debit',
      //   description: `PayPal refund processed - Refund ID: ${refundId}`,
      //   referenceId: refundId,
      // });

      this.logger.log(
        `Refund processed: ${amount} deducted from business ${businessId}`,
      );
    } catch (error) {
      this.logger.error('Error handling payment refund', error);
      throw error;
    }
  }

  /**
   * Handle denied payment
   */
  private async handlePaymentDenied(
    payload: PayPalWebhookPayload,
  ): Promise<void> {
    this.logger.warn(`Payment denied: ${payload.id}`);
    // Implement notification logic here (email, SMS, etc.)
  }

  /**
   * Handle pending payment
   */
  private async handlePaymentPending(
    payload: PayPalWebhookPayload,
  ): Promise<void> {
    this.logger.log(`Payment pending: ${payload.id}`);
    // You might want to create a pending transaction record here
  }
}
