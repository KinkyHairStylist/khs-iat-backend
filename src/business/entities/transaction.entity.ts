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
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';

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
}

export enum TransactionStatus {
  PENDING = 'pending',
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
