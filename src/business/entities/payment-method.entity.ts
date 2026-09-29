import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Wallet } from './wallet.entity';
import { PaymentMethodType } from 'src/admin/payment/enums/wallet.enum';
import { Withdrawal } from 'src/admin/withdrawal/entities/withdrawal.entity';

@Entity('wallet_payment_methods')
export class WalletPaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  walletId: string;

  @Column({
    type: 'enum',
    enum: PaymentMethodType,
  })
  type: PaymentMethodType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  accountNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  accountHolderName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cardExpiryDate: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cardNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cardHolderName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sortCode: string;

  // The currency the merchant wants to be paid out in, e.g. "NGN" while the
  // wallet's own ledger currency stays USD — see WithdrawalService/
  // CurrencyConversionService for how the two are reconciled at withdrawal
  // time. A bank-tab payment method can't be saved without this.
  @Column({ type: 'varchar', length: 3, nullable: true })
  payoutCurrency: string;

  // ISO2 (e.g. "NG") — which country this bank account is in. Informational;
  // payoutCurrency alone drives the actual conversion math.
  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string;

  // Only set on a type: STRIPE_CONNECT row. The merchant's own Stripe
  // Express account id — their bank details live on Stripe's side, not in
  // accountNumber/bankName above. See WithdrawalService.approve and
  // BusinessWalletService.handleStripeAccountUpdated.
  @Column({ type: 'varchar', length: 64, nullable: true })
  stripeAccountId: string;

  // Flipped true by the account.updated webhook once Stripe's own review of
  // this connected account completes. A stripe_connect row is deliberately
  // left with payoutCurrency null until this is true, which is what makes
  // it automatically unusable for withdrawal (see requestWithdrawal's
  // existing payoutCurrency guard) without any extra check needed here.
  @Column({ type: 'boolean', default: false })
  stripePayoutsEnabled: boolean;

  // Only set on a type: AIRWALLEX_CONNECT row. Unlike Stripe's
  // stripeAccountId, this id alone means "ready" — an Airwallex Beneficiary
  // is usable the instant it's created, there's no onboarding-in-progress
  // state to wait on, so there's no equivalent of stripePayoutsEnabled here.
  // payoutCurrency (above) is set immediately at creation time for this
  // rail, not left null pending a webhook.
  @Column({ type: 'varchar', length: 64, nullable: true })
  airwallexBeneficiaryId: string;

  // The raw form-submitted bank-detail fields (account name/number, SWIFT
  // code, address, etc.), keyed exactly as Airwallex's form-schema API
  // named them. Needed because — unlike Stripe Express, which never hands
  // this app the merchant's bank fields at all — Airwallex's Beneficiaries
  // model requires KHS to collect and hold them directly; ReviewWithdrawalModal
  // on the frontend renders this for an admin the way it renders bank/card
  // fields for a plain bank_account row.
  @Column({ type: 'jsonb', nullable: true })
  airwallexBeneficiaryDetails: Record<string, unknown> | null;

  // 'LOCAL' or 'SWIFT' — stamped from whichever transfer method the form
  // schema was fetched for at beneficiary-creation time, so
  // claimAutomaticPayout doesn't need to re-derive it later.
  @Column({ type: 'varchar', length: 10, nullable: true })
  airwallexTransferMethod: string;

  // A card security code is never needed after it was entered and is never sent in a response.
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  cvv: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  last4Digits: string;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Wallet, (wallet) => wallet.paymentMethods)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @OneToMany(() => Withdrawal, (withdrawal) => withdrawal.bankDetails, {
    onDelete: 'SET NULL',
  })
  withdrawalDetails: Withdrawal;
}
