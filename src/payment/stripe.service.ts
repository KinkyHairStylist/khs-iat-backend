import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import {
  PaymentProvider,
  InitializePaymentResult,
  VerifyPaymentResult,
} from './payment-provider.interface';

@Injectable()
export class StripeService implements PaymentProvider {
  readonly supportsPaymentSplitting = true;

  private readonly stripe: Stripe;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY must be set');
    }
    this.stripe = new Stripe(secretKey);
  }

  async initializePayment(payload: {
    email: string;
    amount: number;
    callbackUrl?: string;
    cancelUrl?: string;
    metadata?: any;
    destinationAccountId?: string;
    applicationFeeAmount?: number;
  }): Promise<InitializePaymentResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: payload.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: payload.amount,
            product_data: { name: 'KHS Payment' },
          },
          quantity: 1,
        },
      ],
      success_url: payload.callbackUrl || 'https://example.com/success',
      cancel_url: payload.cancelUrl || payload.callbackUrl || 'https://example.com/cancel',
      metadata: payload.metadata,
      // Destination charge: KHS's account briefly holds the full amount,
      // Stripe automatically transfers everything except the platform fee
      // to the merchant's connected account as part of the same charge.
      payment_intent_data: payload.destinationAccountId
        ? {
            application_fee_amount: payload.applicationFeeAmount ?? 0,
            transfer_data: { destination: payload.destinationAccountId },
          }
        : undefined,
    });

    return {
      reference: session.id,
      authorizationUrl: session.url ?? undefined,
    };
  }

  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    const session = await this.stripe.checkout.sessions.retrieve(reference, {
      expand: ['payment_intent.payment_method'],
    });

    const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
    const paymentMethod = paymentIntent?.payment_method as Stripe.PaymentMethod | null;

    return {
      status: session.payment_status === 'paid' ? 'success' : 'failed',
      amount: session.amount_total ?? 0,
      currency: session.currency ?? 'usd',
      customerEmail: session.customer_details?.email ?? '',
      authorizationCode: paymentMethod?.id,
      cardLast4: paymentMethod?.card?.last4,
      cardExpiryMonth: paymentMethod?.card?.exp_month?.toString(),
      cardExpiryYear: paymentMethod?.card?.exp_year?.toString(),
      cardType: paymentMethod?.card?.brand,
      metadata: session.metadata ?? undefined,
    };
  }

  async refundTransaction(reference: string): Promise<void> {
    const session = await this.stripe.checkout.sessions.retrieve(reference);
    if (typeof session.payment_intent !== 'string') return;

    // If this was a split destination charge (transfer_data set), the
    // merchant's share already left our platform account — reverse_transfer
    // tells Stripe to claw that back too, otherwise the refund can fail or
    // leave the platform account short.
    const paymentIntent = await this.stripe.paymentIntents.retrieve(
      session.payment_intent,
    );

    await this.stripe.refunds.create({
      payment_intent: session.payment_intent,
      reverse_transfer: !!paymentIntent.transfer_data,
    });
  }

  // ─── Connect (merchant payouts) ────────────────────────────────────────
  // Stripe-specific — no Paystack equivalent, so this lives here rather
  // than on the shared PaymentProvider interface.

  /**
   * Creates a new Express Connect account for a merchant (if one doesn't
   * already exist) and returns a one-time hosted onboarding link. The
   * merchant enters their bank/business details on Stripe's own page —
   * none of it touches our backend.
   */
  async createConnectAccountLink(payload: {
    email: string;
    businessId: string;
    existingAccountId?: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ accountId: string; onboardingUrl: string }> {
    const accountId =
      payload.existingAccountId ??
      (
        await this.stripe.accounts.create({
          type: 'express',
          email: payload.email,
          metadata: { businessId: payload.businessId },
        })
      ).id;

    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: payload.refreshUrl,
      return_url: payload.returnUrl,
      type: 'account_onboarding',
    });

    return {
      accountId,
      onboardingUrl: accountLink.url,
    };
  }

  /** True once Stripe considers the account fully able to receive payouts. */
  async isConnectAccountOnboarded(accountId: string): Promise<boolean> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return account.details_submitted && account.payouts_enabled;
  }
}
