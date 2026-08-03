import { Module } from '@nestjs/common';
import { PaystackService } from './paystack.service';
import { StripeService } from './stripe.service';
import { PAYMENT_PROVIDER } from './payment-provider.interface';

@Module({
  providers: [
    PaystackService,
    StripeService,
    {
      provide: PAYMENT_PROVIDER,
      // Flip this to StripeService to switch the whole app's payment
      // processing to Stripe Connect — every service that depends on
      // PAYMENT_PROVIDER (rather than PaystackService/StripeService by
      // name) picks up the change automatically.
      useClass: PaystackService,
    },
  ],
  exports: [PAYMENT_PROVIDER, PaystackService, StripeService],
})
export class PaymentModule {}
