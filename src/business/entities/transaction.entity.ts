import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { User } from 'src/all_user_entities/user.entity';
import { Wallet } from './wallet.entity';
import { WalletCurrency } from 'src/payment/enums/wallet.enum';

// --------------------------
// Transaction Enums
// --------------------------
export enum TransactionType {
  EARNING = 'Earning',
  WITHDRAWAL = 'Withdrawal',
  DEBIT = 'Debit',
  FEE = 'Fee',
  REFUND = 'Refund',
}

export enum PaymentMethod {
  CARD = 'Card',
  BANK = 'Bank',
  PAYSTACK = 'Paystack',
  PAYPAL = 'PayPal',
  GIFTCARD = 'GiftCard',
  CASH = 'Cash',
  STRIPE = 'Stripe',
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}



// --------------------------
// Transaction Entity
// --------------------------
@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // --------------------------
  // Sender (optional)
  // --------------------------
  @Index()
  @Column({ type: 'uuid', nullable: true })
  senderId: string;

  @ManyToOne(() => User, (user) => user.sentTransactions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  // --------------------------
  // Recipient (optional)
  // --------------------------
  @Index()
  @Column({ type: 'uuid', nullable: true })
  recipientId: string;

  @ManyToOne(() => User, (user) => user.receivedTransactions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'recipientId' })
  recipient: User;

  // --------------------------
  // Amount & Currency
  // --------------------------
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string;

  @Column({
    type: 'enum',
    enum: WalletCurrency,
    nullable: true,
  })
  currency: WalletCurrency;

  // --------------------------
  // Metadata
  // --------------------------
  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  service: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mode: string; // e.g. "API", "Web", "Mobile", "Webhook"

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  referenceId: string; // Paystack ref, PayPal orderId, etc.

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    nullable: true,
  })
  method: PaymentMethod;

  // Only meaningful when type = FEE — disambiguates which of the three
  // Phase 1 fee legs this row is (plus LateCancellationForfeiture, added
  // for the cancellation-policy ticket). Plain varchar, not a nested
  // enum, so existing `type = FEE` queries (platform-revenue aggregates,
  // exclusion filters) keep working unchanged — see khs Phase 1 fee-model
  // plan.
  @Column({ type: 'varchar', length: 30, nullable: true })
  feeSubtype:
    | 'Acquisition'
    | 'Commission'
    | 'StripePassthrough'
    | 'LateCancellationForfeiture'
    | 'ChargebackFee'
    | 'MembershipExpirySplit'
    | 'GiftCardExpirySplit'
    | null;

  // Only meaningful on a Stripe-escrow-release EARNING row — set to
  // now()+48h at completion, nulled out by WalletReleaseCronService once
  // matured (also what marks it as already processed, preventing the
  // sweep from double-releasing it). Null for every other transaction —
  // this is the "still in the payout hold" marker, not a general-purpose
  // field.
  @Column({ type: 'timestamptz', nullable: true })
  availableAt: Date | null;


  // --------------------------
  // Timestamps
  // --------------------------
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // --------------------------
  // Wallet Relationship
  // --------------------------
  @Index()
  @Column({ type: 'uuid', nullable: true })
  walletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;
}
