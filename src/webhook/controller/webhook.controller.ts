import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
  Get,
  Patch,
} from '@nestjs/common';
import { Public } from 'src/business/middlewares/public.decorator';
import { WebhookService } from '../services/webhook.service';
import { StripeService } from 'src/payment/stripe.service';
import { AirwallexService } from 'src/payment/airwallex.service';
import { BookingService } from 'src/user/services/booking.service';
import { MerchantSubscriptionService } from 'src/business/services/merchant-subscription.service';
import { BusinessWalletService } from 'src/business/services/wallet.service';
import { SlackService } from 'src/services/slack.service';
import {
  SlackEventType,
  SlackNode,
  SlackProvider,
  SlackSeverity,
} from 'src/utils/enum';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly stripeService: StripeService,
    private readonly airwallexService: AirwallexService,
    private readonly bookingService: BookingService,
    private readonly merchantSubscriptionService: MerchantSubscriptionService,
    private readonly businessWalletService: BusinessWalletService,
  ) {}

  /**
   * Stripe webhook endpoint
   * URL: POST /api/webhook/stripe
   *
   * Requires the raw request body (see the express.raw() middleware
   * registered for this exact path in main.ts) — Stripe's signature
   * verification needs the literal transmitted bytes, not parsed JSON.
   */
  @Public()
  @Post('/stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Request() req,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    let event;
    try {
      event = this.stripeService.constructWebhookEvent(req.body, signature);
    } catch (error) {
      this.logger.error(
        `Stripe webhook signature verification failed: ${error.message}`,
      );
      // Could be misconfiguration (wrong webhook secret) or hostile
      // traffic hitting this endpoint — either way, worth a human looking.
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.ERROR,
        type: SlackEventType.ERROR_ALERT,
        trigger: 'Stripe webhook signature verification failed',
        body: `A Stripe webhook request failed signature verification and was ignored.
• Error: ${error instanceof Error ? error.message : String(error)}`,
      });
      // A bad signature is not a transient failure — acknowledge so Stripe
      // doesn't retry-storm, but do not process the (unverified) payload.
      return { received: true };
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as {
            id: string;
            latest_charge: string | null;
          };
          await this.bookingService.handleStripePaymentSucceeded(
            paymentIntent.id,
            paymentIntent.latest_charge,
          );
          break;
        }
        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as { id: string };
          await this.bookingService.handleStripePaymentFailed(
            paymentIntent.id,
          );
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as { id: string };
          await this.merchantSubscriptionService.handleSubscriptionDeleted(
            subscription.id,
          );
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as {
            subscription: string | null;
            parent?: { subscription_details?: { subscription: string | null } | null } | null;
          };
          // Stripe moved this field under `parent.subscription_details` in
          // newer API versions; the flat field is kept as a fallback.
          const subscriptionId =
            invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
          if (subscriptionId) {
            await this.merchantSubscriptionService.handlePaymentFailed(subscriptionId);
          }
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as {
            subscription: string | null;
            parent?: { subscription_details?: { subscription: string | null } | null } | null;
            period_end: number;
          };
          const subscriptionId =
            invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
          if (subscriptionId) {
            await this.merchantSubscriptionService.handlePaymentSucceeded(
              subscriptionId,
              new Date(invoice.period_end * 1000),
            );
          }
          break;
        }
        case 'charge.dispute.created': {
          // Previously nobody heard about a dispute until it was already
          // closed — this is the earliest possible signal a chargeback is
          // coming, so KHS can react before money moves.
          const dispute = event.data.object as { charge: string; amount: number; reason?: string };
          SlackService.notify({
            node: SlackNode.PAYMENT,
            provider: SlackProvider.STRIPE,
            severity: SlackSeverity.ERROR,
            type: SlackEventType.PAYMENT_FAILURE,
            trigger: `Stripe dispute opened for charge ${dispute.charge}`,
            body: `A customer disputed a Stripe charge. This will debit the business's wallet plus a chargeback fee if lost.
• Charge: ${dispute.charge}
• Amount: $${(dispute.amount / 100).toFixed(2)}
• Reason: ${dispute.reason || 'not provided'}`,
          });
          break;
        }
        case 'charge.dispute.closed': {
          const dispute = event.data.object as {
            status: string;
            charge: string;
            amount: number;
          };
          // Only a permanently lost dispute recovers anything from the
          // business — a "won" dispute (or any other closed status) means
          // nothing was actually taken from KHS, so nothing needs to be
          // recovered.
          if (dispute.status === 'lost') {
            await this.businessWalletService.handleChargeback(
              dispute.charge,
              dispute.amount / 100,
            );
          } else {
            SlackService.notify({
              node: SlackNode.PAYMENT,
              provider: SlackProvider.STRIPE,
              severity: SlackSeverity.INFO,
              type: SlackEventType.PAYMENT_SUCCESS,
              trigger: `Stripe dispute closed (${dispute.status}) for charge ${dispute.charge}`,
              body: `A Stripe dispute closed with status "${dispute.status}" — nothing was taken from the business.
• Charge: ${dispute.charge}`,
            });
          }
          break;
        }
        case 'account.updated': {
          const account = event.data.object as {
            id: string;
            payouts_enabled?: boolean;
            metadata?: { payoutCurrency?: string };
          };
          await this.businessWalletService.handleStripeAccountUpdated(
            account.id,
            account.payouts_enabled ?? false,
            account.metadata?.payoutCurrency || undefined,
          );
          break;
        }
        default:
          this.logger.log(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (error) {
      // A failed webhook is the only signal a payment succeeded — this is
      // a real alert-worthy failure, not a best-effort background sync.
      this.logger.error(
        `Error processing Stripe webhook event ${event.type} (${event.id}): ${error.message}`,
        error.stack,
      );
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.STRIPE,
        severity: SlackSeverity.CRITICAL,
        type: SlackEventType.ERROR_ALERT,
        trigger: `Stripe webhook handler failed: ${event.type}`,
        body: `Processing a Stripe webhook event threw — this covers payment succeeded/failed, subscription deleted, invoice payment failed/succeeded, and dispute closed. Stripe has already acted on this event; KHS's side effects (payout, status change, etc.) may not have happened.
• Event type: ${event.type}
• Event ID: ${event.id}
• Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { received: true };
  }

  /**
   * Airwallex webhook endpoint
   * URL: POST /api/webhook/airwallex
   *
   * The real event name for a transfer status change was never confirmed
   * this session — Airwallex webhooks can't be created via this account's
   * API (POST /webhooks returns 405, dashboard-only), and the docs site is
   * fully JS-rendered so it couldn't be scraped either. Rather than block
   * on that, this handler is deliberately self-teaching: it logs the full
   * payload of the FIRST real event it ever receives (via Slack, capped to
   * a readable size) so the real event/field names can be read off that
   * alert, then makes a best-effort, defensively-guarded attempt to extract
   * a transfer id + status from a few plausible shapes. Tighten the
   * matching once a real event has actually been seen — this is scaffolding
   * for that moment, not a finished integration.
   *
   * Requires the raw request body (see the express.raw() middleware
   * registered for this exact path in main.ts) — signature verification
   * needs the literal transmitted bytes, not parsed JSON.
   */
  @Public()
  @Post('/airwallex')
  @HttpCode(HttpStatus.OK)
  async handleAirwallexWebhook(
    @Request() req,
    @Headers('x-timestamp') timestamp: string,
    @Headers('x-signature') signature: string,
  ): Promise<{ received: boolean }> {
    const rawBody: Buffer = req.body;
    try {
      this.airwallexService.verifyWebhookSignature(rawBody, timestamp, signature);
    } catch (error) {
      this.logger.error(`Airwallex webhook signature verification failed: ${error.message}`);
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.SYSTEM,
        severity: SlackSeverity.ERROR,
        type: SlackEventType.ERROR_ALERT,
        trigger: 'Airwallex webhook signature verification failed',
        body: `An Airwallex webhook request failed signature verification (or AIRWALLEX_WEBHOOK_SECRET isn't set yet) and was ignored.
• Error: ${error instanceof Error ? error.message : String(error)}`,
      });
      // Same reasoning as the Stripe handler: acknowledge so Airwallex
      // doesn't retry-storm, but never process an unverified payload.
      return { received: true };
    }

    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch (error) {
      this.logger.error(`Airwallex webhook payload was not valid JSON: ${error.message}`);
      return { received: true };
    }

    const eventName = event?.name ?? event?.type ?? event?.event_type ?? '(unknown field)';
    this.logger.log(`Airwallex webhook received: ${eventName}`);

    // First-ever-seen logging: teaches us the real shape from the Slack
    // alert. Loud on purpose — this should stop firing once the real event
    // name is confirmed and this handler is tightened to match it exactly.
    SlackService.notify({
      node: SlackNode.PAYMENT,
      provider: SlackProvider.SYSTEM,
      severity: SlackSeverity.INFO,
      type: SlackEventType.PAYMENT_SUCCESS,
      trigger: `Airwallex webhook received: ${eventName}`,
      body: `Use this to confirm the real event name/shape and tighten webhook.controller.ts's handleAirwallexWebhook accordingly.
Payload: ${JSON.stringify(event).slice(0, 2000)}`,
    });

    try {
      // Best-effort extraction across a few plausible shapes — not
      // confirmed against a real event yet (see the method doc above).
      const transferObject =
        event?.data?.object ?? event?.data?.transfer ?? event?.data ?? event;
      const transferId: string | undefined = transferObject?.id;
      const status: string | undefined = transferObject?.status;
      const failureType: string | undefined = transferObject?.failure_type;

      if (transferId && status) {
        await this.businessWalletService.handleAirwallexTransferStatus(
          transferId,
          status,
          failureType,
        );
      } else {
        this.logger.warn(
          `Airwallex webhook ${eventName}: could not extract a transfer id/status from the payload — see the Slack alert above for the real shape.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error processing Airwallex webhook event ${eventName}: ${error.message}`,
        error.stack,
      );
      SlackService.notify({
        node: SlackNode.PAYMENT,
        provider: SlackProvider.SYSTEM,
        severity: SlackSeverity.ERROR,
        type: SlackEventType.ERROR_ALERT,
        trigger: `Airwallex webhook handler failed: ${eventName}`,
        body: `Processing an Airwallex webhook event threw. A merchant's withdrawal status may not have been updated — check by hand, or use the "Refresh status" fallback.
• Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { received: true };
  }

  /**
   * PayPal webhook endpoint
   * URL: POST /webhooks/paypal
   *
   * Configure this URL in your PayPal Developer Dashboard:
   * Sandbox: https://developer.paypal.com/dashboard/applications/sandbox
   * Production: https://developer.paypal.com/dashboard/applications/live
   *
   * Example webhook URL: https://your-domain.com/webhooks/paypal
   */
  @Public()
  @Post('/paypal')
  @HttpCode(HttpStatus.OK)
  async handlePayPalWebhook(
    @Headers() headers: any,
    @Body() body: any,
  ): Promise<{ received: boolean }> {
    try {
      this.logger.log('PayPal webhook received');
      this.logger.log(`Event type: ${body}`);

      // Process the webhook
      await this.webhookService.handleWebhook(headers, body);

      // Always return 200 OK to acknowledge receipt
      return { received: true };
    } catch (error) {
      this.logger.error('Error processing PayPal webhook', error);

      // Still return 200 to prevent PayPal from retrying
      // Log the error for investigation
      return { received: true };
    }
  }

  @Public()
  @Post('/paystack')
  @HttpCode(HttpStatus.OK)
  async handlePaystackWebhook(
    @Request() req,
    @Headers('x-paystack-signature') signature: string,
  ): Promise<any> {
    try {
      this.logger.log('Paystack webhook received');

      // Process the webhook
      const result = await this.webhookService.handlePayStackWebhook(
        signature,
        req.body,
      );

      // Always return 200 OK to acknowledge receipt
      return {
        success: true,
        data: result.data,
        message: result.message,
      };
    } catch (error) {
            this.logger.error('Error processing PayStack webhook', error);

      // Still return 200 to prevent PayStack from retrying
      return {
        success: false,
        error: error.message,
        message: error.message,
      };
    }
  }

  /**
   * Test endpoint to simulate PayPal webhooks
   * ⚠️ DELETE THIS ENDPOINT IN PRODUCTION! ⚠️
   *
   * Usage:
   * POST /webhooks/paypal/test/simulate
   * Body: {
   *   "businessId": "your-business-id",
   *   "amount": 100.50,
   *   "eventType": "PAYMENT.CAPTURE.COMPLETED"
   * }
   */
  @Post('test/simulate')
  @HttpCode(HttpStatus.OK)
  async simulateWebhook(
    @Body()
    testData: {
      businessId: string;
      amount: number;
      eventType?: string;
      currency?: string;
    },
  ): Promise<any> {
    this.logger.warn('🧪 Simulating PayPal webhook - TEST ONLY');

    if (!testData.businessId || !testData.amount) {
      return {
        success: false,
        error: 'businessId and amount are required',
      };
    }

    const eventType = testData.eventType || 'PAYMENT.CAPTURE.COMPLETED';
    const currency = testData.currency || 'USD';
    const timestamp = Date.now();

    let mockPayload: any;

    // Create different mock payloads based on event type
    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        mockPayload = {
          id: `TEST_EVENT_${timestamp}`,
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          create_time: new Date().toISOString(),
          resource_type: 'capture',
          resource: {
            id: `CAPTURE_${timestamp}`,
            status: 'COMPLETED',
            amount: {
              value: testData.amount.toString(),
              currency_code: currency,
            },
            custom_id: testData.businessId,
            invoice_id: testData.businessId,
          },
          summary: 'Test payment capture completed',
        };
        break;

      case 'CHECKOUT.ORDER.COMPLETED':
        mockPayload = {
          id: `TEST_EVENT_${timestamp}`,
          event_type: 'CHECKOUT.ORDER.COMPLETED',
          create_time: new Date().toISOString(),
          resource_type: 'checkout-order',
          resource: {
            id: `ORDER_${timestamp}`,
            status: 'COMPLETED',
            purchase_units: [
              {
                amount: {
                  value: testData.amount.toString(),
                  currency_code: currency,
                },
                custom_id: testData.businessId,
                reference_id: testData.businessId,
              },
            ],
          },
          summary: 'Test order completed',
        };
        break;

      case 'PAYMENT.CAPTURE.REFUNDED':
        mockPayload = {
          id: `TEST_EVENT_${timestamp}`,
          event_type: 'PAYMENT.CAPTURE.REFUNDED',
          create_time: new Date().toISOString(),
          resource_type: 'refund',
          resource: {
            id: `REFUND_${timestamp}`,
            status: 'COMPLETED',
            amount: {
              value: testData.amount.toString(),
              currency_code: currency,
            },
            custom_id: testData.businessId,
            invoice_id: testData.businessId,
          },
          summary: 'Test payment refunded',
        };
        break;

      default:
        return {
          success: false,
          error: `Unsupported event type: ${eventType}`,
        };
    }

    try {
      // Process the simulated webhook (skips signature verification)
      await this.webhookService.handleWebhook({}, mockPayload);

      return {
        success: true,
        message: `Simulated ${eventType} processed successfully`,
        data: {
          businessId: testData.businessId,
          amount: testData.amount,
          currency: currency,
          eventType: eventType,
          mockPayload: mockPayload,
        },
      };
    } catch (error) {
      this.logger.error('Error simulating webhook', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Health check endpoint for webhook
   */
  @Post('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck(): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  /**
   * Setup webhook and get webhook ID
   * ⚠️ Call this ONCE to create your webhook in PayPal ⚠️
   *
   * Usage:
   * POST /webhooks/paypal/setup
   * Body: {
   *   "webhookUrl": "https://your-domain.com/webhooks/paypal"
   * }
   */
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  async setupWebhook(@Body() body: { webhookUrl: string }): Promise<any> {
    try {
      if (!body.webhookUrl) {
        return {
          success: false,
          error: 'webhookUrl is required',
        };
      }

      this.logger.log(`Creating webhook for URL: ${body.webhookUrl}`);
      const webhookId = await this.webhookService.createWebhook(
        body.webhookUrl,
      );

      return {
        success: true,
        message: 'Webhook created successfully',
        data: {
          webhookId: webhookId,
          webhookUrl: body.webhookUrl,
          instruction: `Add this to your .env file: PAYPAL_WEBHOOK_ID=${webhookId}`,
        },
      };
    } catch (error) {
      this.logger.error('Error creating webhook', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List all existing webhooks
   *
   * Usage:
   * GET /webhooks/paypal/list
   */
  @Get('list')
  @HttpCode(HttpStatus.OK)
  async listWebhooks(): Promise<any> {
    try {
      const webhooks = await this.webhookService.listWebhooks();

      return {
        success: true,
        count: webhooks.length,
        webhooks: webhooks.map((wh) => ({
          id: wh.id,
          url: wh.url,
          event_types: wh.event_types,
        })),
      };
    } catch (error) {
      this.logger.error('Error listing webhooks', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update webhook
   *
   * Usage:
   * PATCH /webhooks/paypal/update-webhook
   */
  @Patch('/update-webhook')
  @HttpCode(HttpStatus.OK)
  async updateWebhook(): Promise<any> {
    try {
      const webhook = await this.webhookService.updateWebhook();

      return {
        success: true,
        message: 'Webhook updated successfully',
        data: {
          webhook,
          instruction: `Add this to your .env file: PAYPAL_WEBHOOK_URL`,
        },
      };
    } catch (error) {
      this.logger.error('Error listing webhooks', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
