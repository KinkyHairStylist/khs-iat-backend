import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';
import { Transaction } from 'src/business/entities/transaction.entity';

export enum RefundStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PROCESSED = 'processed',
}

export enum RefundMethod {
  BANK_TRANSFER = 'bank_transfer',
  CARD_REFUND = 'card_refund',
  WALLET_REFUND = 'wallet_refund',
}

@Entity('refunds')
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @OneToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', nullable: true })
  adminNote?: string;

  @Column({
    type: 'enum',
    enum: RefundStatus,
    default: RefundStatus.PENDING,
  })
  status: RefundStatus;

  @Column({
    type: 'enum',
    enum: RefundMethod,
    nullable: true,
  })
  refundMethod: RefundMethod;

  // Account details for refund
  @Column({ type: 'varchar', length: 255, nullable: true })
  bankName?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  accountNumber?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  accountHolderName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  routingNumber?: string; // or sort code for international transfers

  @Column({ type: 'varchar', length: 100, nullable: true })
  bankAddress?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  swiftCode?: string;

  // For card refunds
  @Column({ type: 'varchar', length: 100, nullable: true })
  cardLastFourDigits?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
