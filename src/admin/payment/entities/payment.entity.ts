import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { PaymentModeType, WalletCurrency } from '../enums/wallet.enum';
import { User } from 'src/all_user_entities/user.entity';

export type TransactionStatus =
  | 'pending'
  | 'successful'
  | 'failed'
  | 'refunded'
  | 'disputed';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  businessId: string;

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

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: PaymentModeType, nullable: true })
  method: PaymentModeType;

  @Column({ default: 'pending' })
  status: TransactionStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  fee?: number;

  @Column({ nullable: true })
  refundType?: string;

  @Column({ nullable: true })
  mode?: string;

  @Column({
    type: 'enum',
    enum: WalletCurrency,
    nullable: true,
  })
  currency: WalletCurrency;

  @Column({ nullable: true })
  reason?: string;

  @Column({ nullable: true })
  gatewayTransactionId: string;

  @Column({ nullable: true })
  appointmentId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
