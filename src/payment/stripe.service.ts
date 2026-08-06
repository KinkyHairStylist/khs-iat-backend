import { Injectable, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly secretKey = process.env.STRIPE_SECRET_KEY;
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  private readonly stripe: Stripe;

  constructor() {
    if (!this.secretKey) {
      throw new Error('STRIPE_SECRET_KEY must be set');
    }
    this.stripe = new Stripe(this.secretKey);
  }

  /** Create a PaymentIntent — the customer confirms it client-side via Stripe Elements */
  async createPaymentIntent(payload: {
    amount: number; // in the smallest currency unit (cents)
    currency: string;
    customerEmail: string;
    metadata: Record<string, string | number>;
  }): Promise<Stripe.PaymentIntent> {
    if (!payload.amount || payload.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    if (!Number.isInteger(payload.amount)) {
      throw new BadRequestException('Amount must be an integer (in cents)');
    }

    try {
      return await this.stripe.paymentIntents.create({
        amount: payload.amount,
        currency: payload.currency,
        receipt_email: payload.customerEmail,
        metadata: payload.metadata as Record<string, string>,
        automatic_payment_methods: { enabled: true },
      });
    } catch (error) {
      throw new BadRequestException(
        `Unable to create Stripe payment intent: ${error.message}`,
      );
    }
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      throw new BadRequestException(
        `Unable to retrieve Stripe payment intent: ${error.message}`,
      );
    }
  }

  async createRefund(payload: {
    paymentIntentId: string;
    amount?: number; // omit to refund in full
    reason?: Stripe.RefundCreateParams.Reason;
  }): Promise<Stripe.Refund> {
    try {
      return await this.stripe.refunds.create({
        payment_intent: payload.paymentIntentId,
        amount: payload.amount,
        reason: payload.reason,
      });
    } catch (error) {
      throw new BadRequestException(
        `Unable to create Stripe refund: ${error.message}`,
      );
    }
  }

  /**
   * Returns the exact fee Stripe kept from a charge (in cents), via the
   * charge's balance_transaction. Not a fixed/estimated rate — the real
   * amount, which varies slightly by card type/country.
   */
  async getChargeFee(chargeId: string): Promise<number> {
    // Stripe attaches balance_transaction to a charge asynchronously,
    // shortly after the charge succeeds — cancelling/refunding right after
    // payment can land here before it's ready. Retry with backoff instead
    // of failing immediately, since this resolves itself within seconds.
    const maxAttempts = 3;
    const delayMs = 800;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const charge = await this.stripe.charges.retrieve(chargeId, {
          expand: ['balance_transaction'],
        });
        const balanceTransaction = charge.balance_transaction;
        if (balanceTransaction && typeof balanceTransaction !== 'string') {
          return balanceTransaction.fee;
        }
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new BadRequestException(
            `Unable to retrieve Stripe charge fee: ${error.message}`,
          );
        }
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new BadRequestException(
      'Unable to retrieve Stripe charge fee: balance_transaction was not expanded',
    );
  }

  /** Verifies and parses a webhook payload — requires the raw request body, not parsed JSON */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set');
    }
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }
}
