// A shared contract every payment provider (Paystack today, Stripe Connect
// later) must implement. The rest of the app depends on this interface,
// never on a specific provider class directly — so swapping or adding a
// provider means writing one new class, not touching every call site.

export interface InitializePaymentResult {
  reference: string;
  authorizationUrl?: string; // hosted checkout link, if the provider uses one
}

export interface VerifyPaymentResult {
  status: 'success' | 'failed' | 'pending';
  amount: number; // in the smallest currency unit (kobo/cents)
  currency: string;
  customerEmail: string;
  authorizationCode?: string; // reusable token, if a card was saved
  cardLast4?: string;
  cardExpiryMonth?: string;
  cardExpiryYear?: string;
  cardType?: string; // e.g. "visa", "mastercard" — for display purposes
  // Whatever custom metadata was passed into initializePayment — e.g.
  // booking/gift-card/order IDs stashed at checkout time, read back here
  // once the payment verifies.
  metadata?: Record<string, any>;
}

export interface PaymentProvider {
  initializePayment(payload: {
    email: string;
    amount: number;
    callbackUrl?: string; // where to redirect after a SUCCESSFUL payment
    cancelUrl?: string; // where to redirect if the customer cancels/backs out
    metadata?: any;
  }): Promise<InitializePaymentResult>;

  verifyPayment(reference: string): Promise<VerifyPaymentResult>;

  refundTransaction(reference: string): Promise<void>;
}

// The DI (dependency injection) token used to register/inject whichever
// concrete provider is active. NestJS interfaces don't exist at runtime
// (TypeScript erases them when compiling to JavaScript), so a plain string
// token is what modules actually wire up — see payment.module.ts.
export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
