import { Controller, Post, Body, Headers, BadRequestException, Logger } from '@nestjs/common';
import { GiftCardService } from 'src/user/services/gift-card.service';

@Controller('webhooks/paystack')
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(private readonly giftCardService: GiftCardService) {}

  @Post()
  async handleWebhook(@Headers('x-paystack-signature') signature: string, @Body() body: any) {
    try {
      // Verify signature
      const rawBody = Buffer.from(JSON.stringify(body));
      const hash = require('crypto').createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(rawBody)
        .digest('hex');

      if (hash !== signature) throw new BadRequestException('Invalid Paystack signature');

      // Only handle successful charges
      if (body.event === 'charge.success') {
        const reference = body.data.reference;
        const result = await this.giftCardService.completeGiftCardPurchase(reference);

        this.logger.log(`Gift card purchased via Paystack: ${reference}`);
        return { status: 'success' };
      }

      return { status: 'ignored' };
    } catch (err) {
      this.logger.error('Paystack webhook error', err);
      throw err;
    }
  }
}
