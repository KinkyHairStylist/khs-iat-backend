import { Controller, Post, Body, Headers, BadRequestException, Logger, Req } from '@nestjs/common';
import { GiftCardService } from 'src/user/services/gift-card.service';
import { Public } from 'src/business/middlewares/public.decorator';

@Controller('webhooks/paystack')
export class PaystackWebhookController {
  private readonly logger = new Logger(PaystackWebhookController.name);

  constructor(private readonly giftCardService: GiftCardService) {}

  @Public()
  @Post()
  async handleWebhook(
    @Req() req: any,
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
  ) {
    try {
      // Verify against the exact bytes Paystack sent (main.ts's
      // express.json verify hook captures this) — re-serializing the
      // already-parsed body is not guaranteed to match the original bytes.
      if (!req.rawBody) {
        throw new BadRequestException(
          'Raw request body unavailable — cannot verify Paystack signature',
        );
      }
      const hash = require('crypto').createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(req.rawBody)
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
