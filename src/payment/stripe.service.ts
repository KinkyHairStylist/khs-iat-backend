import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
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

  /** Cancels a PaymentIntent that has not been paid, so it can no longer be paid. */
  async cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.cancel(paymentIntentId);
    } catch (error) {
      throw new BadRequestException(
        `Unable to cancel Stripe payment intent: ${error.message}`,
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

  /** Creates a Stripe Customer for a business — done at admin-approval time,
   * before any card exists, so there's a stable ID to attach a payment
   * method and a subscription to later. */
  async createCustomerForBusiness(payload: {
    businessId: string;
    email?: string;
    name?: string;
  }): Promise<Stripe.Customer> {
    try {
      return await this.stripe.customers.create({
        email: payload.email,
        name: payload.name,
        metadata: { businessId: payload.businessId },
      });
    } catch (error) {
      throw new BadRequestException(
        `Unable to create Stripe customer: ${error.message}`,
      );
    }
  }

  /** Returns a SetupIntent's client_secret — the frontend uses this with
   * Stripe Elements to collect and save a card without charging it yet. */
  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    try {
      return await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      });
    } catch (error) {
      throw new BadRequestException(
        `Unable to create Stripe setup intent: ${error.message}`,
      );
    }
  }

  async attachPaymentMethodAsDefault(
    customerId: string,
    paymentMethodId: string,
  ): Promise<void> {
    try {
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
      await this.stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    } catch (error) {
      throw new BadRequestException(
        `Unable to attach Stripe payment method: ${error.message}`,
      );
    }
  }

  /** trialEnd: a Unix timestamp (seconds) to delay the first real charge
   * until, or the literal string 'now' to charge immediately (used for a
   * merchant re-subscribing after their trial already lapsed). */
  async createSubscription(
    customerId: string,
    priceId: string,
    trialEnd: number | 'now',
  ): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        trial_end: trialEnd,
      });
    } catch (error) {
      throw new BadRequestException(
        `Unable to create Stripe subscription: ${error.message}`,
      );
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      throw new BadRequestException(
        `Unable to cancel Stripe subscription: ${error.message}`,
      );
    }
  }

  // ---- Merchant sign-up billing (the merchant has no business yet) ----

  /** A Customer for a merchant who is signing up, tagged with their user id. */
  async createCustomerForUser(payload: {
    userId: string;
    email?: string;
    name?: string;
  }): Promise<Stripe.Customer> {
    try {
      return await this.stripe.customers.create({
        email: payload.email,
        name: payload.name,
        metadata: { userId: payload.userId, purpose: 'merchant-signup' },
      });
    } catch (error) {
      throw new BadRequestException(`Unable to create Stripe customer: ${error.message}`);
    }
  }

  async retrieveCustomer(customerId: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
    try {
      return await this.stripe.customers.retrieve(customerId);
    } catch (error) {
      throw new BadRequestException(`Unable to read Stripe customer: ${error.message}`);
    }
  }

  async retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      throw new BadRequestException(`Unable to read Stripe subscription: ${error.message}`);
    }
  }

  /** Subscriptions already on a customer (used to make a retried sign-up idempotent). */
  async listCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    try {
      const result = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10,
      });
      return result.data;
    } catch (error) {
      throw new BadRequestException(`Unable to list Stripe subscriptions: ${error.message}`);
    }
  }

  /**
   * Starts billing immediately and only succeeds if the first payment does: with
   * error_if_incomplete a declined or unauthenticated card raises an error instead of
   * leaving a half-created subscription behind.
   */
  async createSubscriptionNow(
    customerId: string,
    priceId: string,
    metadata: Record<string, string>,
  ): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'error_if_incomplete',
        metadata,
      });
    } catch (error) {
      throw new BadRequestException(
        `Your card could not be charged: ${error.message}`,
      );
    }
  }

  /**
   * Moves a live subscription to another price (a plan change). The difference is
   * prorated onto the next invoice rather than charged on the spot.
   */
  async changeSubscriptionPrice(
    subscriptionId: string,
    priceId: string,
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const item = subscription.items.data[0];
      if (!item) throw new Error('subscription has no items');
      if (item.price.id === priceId) return subscription;
      return await this.stripe.subscriptions.update(subscriptionId, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: 'create_prorations',
      });
    } catch (error) {
      throw new BadRequestException(`Unable to change the Stripe subscription: ${error.message}`);
    }
  }

  /**
   * Cancels a subscription now and refunds the customer's most recent successful payment
   * in full (used when a merchant's application is rejected after they paid). Charges
   * are looked up by customer, which does not depend on the invoice's payment fields.
   */
  async cancelAndRefundSubscription(
    subscriptionId: string,
    customerId: string,
  ): Promise<{ refundId: string | null }> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      // Already cancelled is fine; anything else must surface.
      if (error?.code !== 'resource_missing') {
        throw new BadRequestException(`Unable to cancel Stripe subscription: ${error.message}`);
      }
    }

    try {
      const charges = await this.stripe.charges.list({ customer: customerId, limit: 5 });
      const charge = charges.data.find((c) => c.status === 'succeeded' && !c.refunded);
      if (!charge) return { refundId: null };
      const refund = await this.stripe.refunds.create({ charge: charge.id });
      return { refundId: refund.id };
    } catch (error) {
      throw new BadRequestException(`Unable to refund the payment: ${error.message}`);
    }
  }

  /**
   * Whether a stored Stripe price id actually exists under this environment's Stripe
   * account/mode -- a stored id can belong to a different one (see createTierPrice's
   * comment below), so "known to our DB" doesn't mean "usable here". Cheap check: a
   * plain retrieve, not a mutation, so it's safe to call on every use of a stored price
   * rather than only when a value is being changed.
   */
  async priceExists(priceId: string): Promise<boolean> {
    try {
      await this.stripe.prices.retrieve(priceId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * A new recurring monthly price for a merchant plan. When the plan's old price is
   * known its Stripe product is reused; otherwise a product is created. Existing
   * subscribers stay on their old price; only new sign-ups get the new one.
   */
  async createTierPrice(payload: {
    tier: string;
    amountCents: number;
    currency?: string;
    existingPriceId?: string;
  }): Promise<Stripe.Price> {
    if (!Number.isInteger(payload.amountCents) || payload.amountCents < 50) {
      throw new BadRequestException('Price must be at least 0.50');
    }
    try {
      let productId: string | undefined;
      if (payload.existingPriceId) {
        // The stored price id can belong to a different Stripe account/mode
        // than whatever STRIPE_SECRET_KEY this environment is running with
        // right now -- platform_settings.payments.subscriptionPrices lives
        // in the shared database, but Stripe price ids are inherently
        // environment-specific, so "known to the DB" doesn't mean "known to
        // THIS Stripe account". Confirmed live: a price created under one
        // environment's key came back "No such price" under another's,
        // permanently blocking any pricing change from that environment
        // with no way to recover, since this used to just rethrow. Falling
        // through to create a fresh product below is exactly what already
        // happens when there was never a stored price at all -- the same
        // safe behavior, just also reached when the stored one turns out to
        // be unusable here rather than only when it's absent.
        try {
          const existing = await this.stripe.prices.retrieve(payload.existingPriceId);
          productId = typeof existing.product === 'string' ? existing.product : existing.product.id;
        } catch (retrieveError) {
          this.logger.warn(
            `Stored price ${payload.existingPriceId} for tier ${payload.tier} not found in this Stripe account (${retrieveError.message}) -- creating a new product instead of reusing it.`,
          );
        }
      }
      if (!productId) {
        const product = await this.stripe.products.create({
          name: `KHS Merchant Subscription — ${payload.tier}`,
        });
        productId = product.id;
      }
      return await this.stripe.prices.create({
        product: productId,
        unit_amount: payload.amountCents,
        currency: payload.currency ?? 'usd',
        recurring: { interval: 'month' },
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Unable to create Stripe price: ${error.message}`);
    }
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
