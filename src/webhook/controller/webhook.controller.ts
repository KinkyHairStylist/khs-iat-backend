import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
} from '@nestjs/common';
import { WebhookService } from '../services/webhook.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Post('/paystack')
  @HttpCode(HttpStatus.OK)
  async handlePaystackWebhook(
    @Request() req,
    @Headers('x-paystack-signature') signature: string,
  ): Promise<any> {
    try {
      this.logger.log('Paystack webhook received');

      const result = await this.webhookService.handlePayStackWebhook(
        signature,
        req.body,
      );

      return {
        success: true,
        data: result?.data,
        message: result?.message,
      };
    } catch (error) {
      this.logger.error('Error processing Paystack webhook', error);

      return {
        success: false,
        error: error.message,
        message: error.message,
      };
    }
  }

  @Post('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck(): Promise<{ status: string }> {
    return { status: 'ok' };
  }
}
