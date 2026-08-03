import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Public } from 'src/business/middlewares/public.decorator';
import { StripeService } from 'src/payment/stripe.service';
import { BusinessWalletService } from 'src/business/services/wallet.service';

/**
 * POST /webhooks/stripe
 *
 * Configure this URL in the Stripe Dashboard: Developers → Webhooks.
 * Subscribe at least to "account.updated" (Connect onboarding status).
 * Copy the "Signing secret" Stripe shows after creating the endpoint
 * into STRIPE_WEBHOOK_SECRET.
 */
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly walletService: BusinessWalletService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException(
        'Raw request body unavailable — cannot verify Stripe signature',
      );
    }

    let event;
    try {
      event = this.stripeService.constructWebhookEvent(req.rawBody, signature);
    } catch (err) {
      this.logger.error(`Stripe webhook signature verification failed: ${err.message}`);
      // A failed signature check must not be treated as a valid event —
      // reject it outright rather than acknowledging receipt.
      throw new BadRequestException('Invalid Stripe signature');
    }

    this.logger.log(`Stripe webhook received: ${event.type}`);

    try {
      if (event.type === 'account.updated') {
        const account = event.data.object as { id: string; metadata?: { businessId?: string } };
        await this.walletService.syncPayoutOnboardingStatus(account.id);
      }
    } catch (err) {
      // Log but still acknowledge receipt (return 200) — Stripe retries
      // aggressively on non-2xx, and retrying won't fix a bug in our own
      // handling. Errors here need investigation, not a resend.
      this.logger.error(`Error handling Stripe webhook ${event.type}: ${err.message}`);
    }

    return { received: true };
  }
}
