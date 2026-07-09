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

export enum PaymentMethodType {
  BANK_ACCOUNT = 'bank_account',
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  DIGITAL_WALLET = 'digital_wallet',
}
export type PaymentMethod = 'paypal'; // ✅ Only PayPal now

export enum PaymentModeType {
  PAYPAL = 'paypal',
  PAYSTACK = 'paystack',
}
