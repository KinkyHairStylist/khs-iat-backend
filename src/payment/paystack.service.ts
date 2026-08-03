import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import {
  PaymentProvider,
  InitializePaymentResult,
  VerifyPaymentResult,
} from './payment-provider.interface';

@Injectable()
export class PaystackService implements PaymentProvider {
  readonly supportsPaymentSplitting = false;

  private readonly secretKey = process.env.PAYSTACK_SECRET_KEY;
  private readonly baseUrl = process.env.PAYSTACK_BASE_URL;

  constructor() {
    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY must be set');
    }
  }

  /** Initialize Paystack Payment */
  // Note: payload may include destinationAccountId/applicationFeeAmount
  // (Stripe Connect payment-splitting) — Paystack has no equivalent, so
  // those fields are simply not read here. A booking for a merchant who
  // requires split payments must not reach this provider in the first
  // place (see BookingService.confirmBooking's onboarding check).
  async initializePayment(payload: {
    email: string;
    amount: number; // in kobo
    callbackUrl?: string;
    metadata?: any;
  }): Promise<InitializePaymentResult> {
    if (!payload.email || typeof payload.email !== 'string') {
      throw new BadRequestException('Valid email is required');
    }
    if (!payload.amount || payload.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    if (!Number.isInteger(payload.amount)) {
      throw new BadRequestException('Amount must be an integer (in kobo)');
    }
    if (!this.baseUrl) {
      throw new BadRequestException('Paystack base URL not configured');
    }

    try {
      const res = await axios.post(
        `${this.baseUrl}/transaction/initialize`,
        {
          email: payload.email,
          amount: payload.amount,
          callback_url: payload.callbackUrl,
          metadata: payload.metadata,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      return {
        reference: res.data.data.reference,
        authorizationUrl: res.data.data.authorization_url,
      };
    } catch (error) {
      console.error('Paystack initialization error:', error.response?.data || error.message);

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error.response?.status === 400) {
        throw new BadRequestException(`Paystack validation error: ${error.response?.data?.message || 'Invalid request parameters'}`);
      }

      if (error.response?.status === 401) {
        throw new BadRequestException('Paystack authentication failed - check secret key');
      }

      if (error.response?.status === 500) {
        throw new BadRequestException('Paystack server error');
      }

      throw new BadRequestException(`Unable to initialize Paystack payment: ${error.message}`);
    }
  }

  /** Verify Paystack Payment */
  async verifyPayment(reference: string): Promise<VerifyPaymentResult> {
    try {
      const res = await axios.get(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const data = res.data.data;

      return {
        status: data.status === 'success' ? 'success' : 'failed',
        amount: data.amount,
        currency: data.currency,
        customerEmail: data.customer?.email,
        authorizationCode: data.authorization?.authorization_code,
        cardLast4: data.authorization?.last4,
        cardExpiryMonth: data.authorization?.exp_month,
        cardExpiryYear: data.authorization?.exp_year,
        cardType: data.authorization?.card_type || data.authorization?.brand,
        metadata: data.metadata,
      };
    } catch (error) {
      throw new BadRequestException('Unable to verify Paystack payment');
    }
  }

  /**
   * Refund a transaction. Used after the small card-verification charge in
   * the "add card" flow — the customer is only ever charged to obtain a
   * reusable authorization code, never to actually pay for anything, so
   * that charge is refunded immediately once the token is captured.
   */
  async refundTransaction(reference: string): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/refund`,
        { transaction: reference },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );
    } catch (error) {
      // Don't fail the whole flow if the refund call has a hiccup — logged
      // so it can be refunded manually if this ever fires.
      console.error(
        'Paystack refund error:',
        error.response?.data || error.message,
      );
    }
  }
}
