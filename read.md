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
  private readonly paystackSecretKey: string;

  constructor(
    private readonly walletService: BusinessWalletService,
    private readonly paymentsService: PaymentService,
  ) {
    this.paypalBaseUrl = process.env.PAYPAL_SANDBOX_URL || process.env.PAYPAL_BASE_URL || '';
    this.clientId = process.env.PAYPAL_CLIENT_ID || '';
    this.clientSecret = process.env.PAYPAL_SECRET_KEY || '';
    this.webhookId = process.env.PAYPAL_WEBHOOK_ID || '';
    this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || '';

    // Fail fast in dev if critical keys missing (optional)
    if (!this.paystackSecretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY is not set. Paystack webhooks will fail verification.');
    }
    if (!this.clientId || !this.clientSecret || !this.paypalBaseUrl || !this.webhookId) {
      this.logger.warn('PayPal credentials or webhook id missing. PayPal webhook operations may fail.');
    }
  }

  // -------------------------
  // PayPal: get access token
  // -------------------------
  private async getPayPalAccessToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret || !this.paypalBaseUrl) {
      throw new InternalServerErrorException('PayPal configuration missing');
    }

    try {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const res = await axios.post<PayPalAuthResponse>(
        `${this.paypalBaseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
          },
        },
      );

      return res.data.access_token;
    } catch (err) {
      this.logger.error('Failed to obtain PayPal access token', err?.response?.data ?? err);
      throw new InternalServerErrorException('Failed to authenticate with PayPal');
    }
  }

  // -------------------------
  // PayPal: verify signature
  // -------------------------
  async verifyPayPalWebhook(headers: Record<string, string>, body: any): Promise<boolean> {
    if (!this.webhookId) {
      this.logger.warn('PayPal webhook id not configured; skipping verify-webhook-signature');
      return false;
    }

    // Normalize headers to lowercase keys for stable access
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers || {})) {
      normalized[k.toLowerCase()] = Array.isArray(v) ? v[0] : (v as any);
    }

    // required headers per PayPal docs
    const verificationPayload = {
      auth_algo: normalized['paypal-auth-algo'.toLowerCase()] || normalized['paypal-auth-algo'],
      cert_url: normalized['paypal-cert-url'.toLowerCase()] || normalized['paypal-cert-url'],
      transmission_id: normalized['paypal-transmission-id'.toLowerCase()] || normalized['paypal-transmission-id'],
      transmission_sig: normalized['paypal-transmission-sig'.toLowerCase()] || normalized['paypal-transmission-sig'],
      transmission_time: normalized['paypal-transmission-time'.toLowerCase()] || normalized['paypal-transmission-time'],
      webhook_id: this.webhookId,
      webhook_event: body,
    };

    try {
      const token = await this.getPayPalAccessToken();
      const resp = await axios.post(
        `${this.paypalBaseUrl}/v1/notifications/verify-webhook-signature`,
        verificationPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const status = resp.data?.verification_status;
      this.logger.log(`PayPal verify-webhook-signature: ${status}`);
      return status === 'SUCCESS';
    } catch (err) {
      this.logger.error('Error verifying PayPal webhook signature', err?.response?.data ?? err);
      return false;
    }
  }

  // -------------------------
  // Paystack: verify HMAC against raw body
  // -------------------------
  verifyPaystackSignature(rawBody: Buffer | string, signatureHeader: string | undefined): boolean {
    if (!this.paystackSecretKey) {
      this.logger.warn('Paystack secret key missing; cannot verify signature');
      return false;
    }
    if (!signatureHeader) {
      this.logger.warn('Paystack signature header missing');
      return false;
    }

    const raw = rawBody instanceof Buffer ? rawBody : Buffer.from(String(rawBody));
    const computed = crypto.createHmac('sha512', this.paystackSecretKey).update(raw).digest('hex');

    const valid = computed === signatureHeader;
    if (!valid) {
      this.logger.warn(`Paystack signature mismatch — computed: ${computed} header: ${signatureHeader}`);
    }
    return valid;
  }

  // -------------------------
  // Public handler for PayPal webhooks
  // -------------------------
  async handlePayPalWebhook(headers: Record<string, any>, body: any): Promise<void> {
    // Normalize event type location
    const payload: PayPalWebhookPayload = body;

    // verify signature
    const ok = await this.verifyPayPalWebhook(headers, body);
    if (!ok) {
      this.logger.warn('Invalid PayPal webhook signature');
      throw new BadRequestException('Invalid PayPal webhook signature');
    }

    this.logger.log(`Received PayPal webhook: ${payload.event_type}`);

    try {
      switch (payload.event_type) {
        case PayPalWebhookEvent.PAYMENT_CAPTURE_COMPLETED:
          await this.onPayPalPaymentCaptureCompleted(payload);
          break;

        case PayPalWebhookEvent.CHECKOUT_ORDER_COMPLETED:
          await this.onPayPalCheckoutOrderCompleted(payload);
          break;

        case PayPalWebhookEvent.PAYMENT_CAPTURE_REFUNDED:
          await this.onPayPalPaymentRefunded(payload);
          break;

        case PayPalWebhookEvent.PAYMENT_CAPTURE_DENIED:
          await this.onPayPalPaymentDenied(payload);
          break;

        case PayPalWebhookEvent.PAYMENT_CAPTURE_PENDING:
          await this.onPayPalPaymentPending(payload);
          break;

        default:
          this.logger.log(`Unhandled PayPal event: ${payload.event_type}`);
      }
    } catch (err) {
      this.logger.error('Error processing PayPal webhook', err);
      // rethrow so controllers can return 500 if needed
      throw err;
    }
  }

  // -------------------------
  // Public handler for Paystack webhooks (requires raw body)
  // -------------------------
  async handlePaystackWebhook(signatureHeader: string | undefined, rawBody: Buffer): Promise<any> {
    if (!this.verifyPaystackSignature(rawBody, signatureHeader)) {
      throw new BadRequestException('Invalid Paystack signature');
    }

    // parse body (Paystack sends JSON)
    let body: any;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch (err) {
      this.logger.error('Failed to parse Paystack webhook JSON', err);
      throw new BadRequestException('Invalid JSON payload');
    }

    const event = body.event;
    const data = body.data;

    this.logger.log(`Paystack webhook event: ${event}`);

    try {
      if (event === 'charge.success') {
        const reference = data.reference;
        // Let your payment service verify with Paystack and mark transaction/s
        const result = await this.paymentsService.verifyPaystackPayment(reference);

        // Optionally: credit business wallet (example)
        // if result contains businessId + amount:
        if (result?.status === 'success' && result?.amount && result?.metadata?.businessId) {
          const businessId = result.metadata.businessId;
          const amount = Number(result.amount) / 100; // paystack in kobo
          await this.walletService.addFunds({
            businessId,
            amount,
            type: 'credit',
            description: `Paystack charge.success — reference ${reference}`,
            referenceId: reference,
          });
        }

        return result;
      }

      // handle other events if you'd like
      return { ok: true, event };
    } catch (err) {
      this.logger.error('Error handling Paystack webhook', err);
      throw err;
    }
  }

  // -------------------------
  // PayPal event handlers
  // -------------------------
  private async onPayPalPaymentCaptureCompleted(payload: PayPalWebhookPayload) {
    const resource = payload.resource;
    const amount = parseFloat(resource.amount?.value ?? '0');
    const currency = resource.amount?.currency_code;
    const paypalTransactionId = resource.id;

    // business id passed in custom_id or invoice_id when you created order
    const businessId = resource.custom_id || resource.invoice_id || resource.supplementary_data?.related_ids?.order_id;

    if (!businessId) {
      this.logger.error('No businessId in PayPal capture payload; cannot credit wallet');
      throw new BadRequestException('Missing business reference in PayPal webhook');
    }

    // call your payment service to create/verify a transaction record if required
    await this.paymentsService.processPayPalCapture({
      reference: paypalTransactionId,
      businessId,
      amount,
      currency,
      rawPayload: payload,
    });

    // credit wallet (business)
    await this.walletService.addFunds({
      businessId,
      amount,
      type: 'credit',
      description: `PayPal payment capture completed — ${paypalTransactionId}`,
      referenceId: paypalTransactionId,
    });

    this.logger.log(`Credited business ${businessId} with ${amount} ${currency}`);
  }

  private async onPayPalCheckoutOrderCompleted(payload: PayPalWebhookPayload) {
    const resource = payload.resource;
    const purchaseUnit = resource.purchase_units?.[0];
    if (!purchaseUnit) {
      this.logger.warn('No purchase unit in PayPal order completed payload');
      return;
    }

    const amount = parseFloat(purchaseUnit.amount?.value ?? '0');
    const currency = purchaseUnit.amount?.currency_code;
    const orderId = resource.id;
    const businessId = purchaseUnit.custom_id || purchaseUnit.reference_id;

    if (!businessId) {
      this.logger.error('No businessId found in PayPal order payload');
      return;
    }

    await this.paymentsService.processPayPalOrder({
      orderId,
      businessId,
      amount,
      currency,
      rawPayload: payload,
    });

    await this.walletService.addFunds({
      businessId,
      amount,
      type: 'credit',
      description: `PayPal order completed — ${orderId}`,
      referenceId: orderId,
    });

    this.logger.log(`Order completed: ${amount} ${currency} added to business ${businessId}`);
  }

  private async onPayPalPaymentRefunded(payload: PayPalWebhookPayload) {
    const resource = payload.resource;
    const amount = parseFloat(resource.amount?.value ?? '0');
    const refundId = resource.id;
    const businessId = resource.custom_id || resource.invoice_id;

    if (!businessId) {
      this.logger.error('No businessId found for refund');
      return;
    }

    // ask paymentsService to register the refund
    await this.paymentsService.processPayPalRefund({
      refundId,
      businessId,
      amount,
      rawPayload: payload,
    });

    // deduct from business wallet
    await this.walletService.deductFunds({
      businessId,
      amount,
      type: 'debit',
      description: `PayPal refund processed — ${refundId}`,
      referenceId: refundId,
    });

    this.logger.log(`Refund processed: ${amount} deducted from business ${businessId}`);
  }

  private async onPayPalPaymentDenied(payload: PayPalWebhookPayload) {
    this.logger.warn(`Payment denied: ${payload.id}`);
    // implement notifications or marking transaction failed
  }

  private async onPayPalPaymentPending(payload: PayPalWebhookPayload) {
    this.logger.log(`Payment pending: ${payload.id}`);
    // create a pending transaction if you want
  }

  // Utility for creating webhook programmatically (if needed)
  async createPayPalWebhook(webhookUrl: string) {
    const token = await this.getPayPalAccessToken();
    const resp = await axios.post(
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
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    return resp.data;
  }
}


controller
import {
  Controller,
  Post,
  Req,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { Request } from 'express';

@Controller('api/webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  // PayPal uses JSON; normal body parser okay
  @Post('paypal')
  @HttpCode(HttpStatus.OK)
  async paypal(@Headers() headers: any, @Body() body: any) {
    await this.webhookService.handlePayPalWebhook(headers, body);
    return { ok: true };
  }

  // Paystack MUST use raw body. See app setup below.
  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  async paystack(@Headers('x-paystack-signature') signature: string, @Req() req: Request) {
    // req.rawBody must be available (set up in main.ts).
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body is required for Paystack webhook');
    }

    const result = await this.webhookService.handlePaystackWebhook(signature, rawBody);
    return result || { ok: true };
  }
}


main.ts
import * as express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // To keep JSON body for all routes but raw for paystack:
  // Mount a separate express instance for the webhooks path with raw parser
  const rawApp = express();
  rawApp.use(express.raw({ type: '*/*' })); // or 'application/json'
  app.use('/api/webhooks/paystack', rawApp);

  // Alternative: use body-parser raw only for that route using app.use
  // app.use('/api/webhooks/paystack', express.raw({ type: '*/*' }));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
