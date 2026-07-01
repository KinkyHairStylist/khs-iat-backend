import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentService } from 'src/admin/payment/payment.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly paystackAccessKey: string;

  constructor(private readonly paymentsService: PaymentService) {
    const paystackAccessKey = process.env.PAYSTACK_SECRET_KEY;

    if (!paystackAccessKey) {
      throw new Error('PAYSTACK_SECRET_KEY must be set');
    }

    this.paystackAccessKey = paystackAccessKey;
  }

  async handlePayStackWebhook(
    signature: string,
    bodyPayload: any,
  ): Promise<any> {
    const rawBody =
      bodyPayload instanceof Buffer
        ? bodyPayload
        : Buffer.from(JSON.stringify(bodyPayload));

    const hash = crypto
      .createHmac('sha512', this.paystackAccessKey)
      .update(rawBody)
      .digest('hex');

    if (hash !== signature) {
      throw new BadRequestException('Invalid Paystack signature');
    }

    const event = bodyPayload.event;
    const data = bodyPayload.data;

    if (event === 'charge.success') {
      const reference = data.reference;
      const result = await this.paymentsService.verifyPaystackPayment(reference);
      this.logger.log(`Payment verified via webhook: ${reference}`);
      return result;
    }

    this.logger.log(`Unhandled Paystack event: ${event}`);
    return { received: true };
  }
}
