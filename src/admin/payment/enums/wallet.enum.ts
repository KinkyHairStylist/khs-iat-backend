// Enums for wallet management
export enum WalletStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

export enum WalletCurrency {
  USD = 'USD',
  EUR = 'EUR',
  AUD = 'AUD',
  GBP = 'GBP',
  NGN = 'NGN',
}

// The single internal ledger currency every wallet is created in and every
// Stripe charge is denominated in. A wallet's own `currency` column is what
// transactions are actually stamped with (see WalletService.processTransaction
// / addFundsPending); this constant only controls what NEW wallets default to
// and what literal Stripe is told, so it's the one place a future change to
// the platform's ledger currency would start.
export const PLATFORM_LEDGER_CURRENCY = WalletCurrency.USD;

export enum PaymentMethodType {
  BANK_ACCOUNT = 'bank_account',
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  DIGITAL_WALLET = 'digital_wallet',
  // A Stripe Express connected account — the merchant's own payout details
  // live on Stripe's side, not in accountNumber/bankName here. See
  // stripeAccountId/stripePayoutsEnabled on WalletPaymentMethod.
  STRIPE_CONNECT = 'stripe_connect',
}
export enum PaymentModeType {
  PAYSTACK = 'paystack',
}
