import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import {
  PaymentProvider,
  InitializePaymentResult,
  VerifyPaymentResult,
} from './payment-provider.interface';

@Injectable()
export class StripeService implements PaymentProvider {
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
    if (typeof session.payment_intent === 'string') {
      await this.stripe.refunds.create({
        payment_intent: session.payment_intent,
      });
    }
  }
}
