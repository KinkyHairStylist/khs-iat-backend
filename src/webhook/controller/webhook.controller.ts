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
import { WebhookService } from '../services/webhook.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

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
      console.log('WEBHOOK ERROR:', error);
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
