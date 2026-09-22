import { Business } from 'src/business/entities/business.entity';
import { WalletPaymentMethod } from 'src/business/entities/payment-method.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';

@Entity('withdrawals')
export class Withdrawal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.withdrawals, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  businessName: string;

  @ManyToOne(
    () => WalletPaymentMethod,
    (walletPaymentMethod) => walletPaymentMethod.withdrawalDetails,
    {
      nullable: true,
      eager: true,
      onDelete: 'SET NULL',
    },
  )
  @JoinColumn({ name: 'bankDetailsId' })
  bankDetails: WalletPaymentMethod;

  @Column({ type: 'uuid', nullable: true })
  bankDetailsId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  // Pending: waiting for KHS to review. Processing: approved, KHS is sending the money. Completed: KHS
  // has sent it (payoutReference says how to trace it). Rejected: KHS refused (rejectionReason says
  // why) and the amount went back to the wallet. Cancelled: the salon withdrew the request first.
  @Column({ default: 'Pending' })
  status: 'Pending' | 'Processing' | 'Completed' | 'Rejected' | 'Cancelled';

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  currentBalance: number;

  @Column({ nullable: true })
  requestDate: string;

  @Column({ nullable: true })
  timeAgo: string;

  // The transfer reference KHS entered when it sent the money, and when.
  @Column({ type: 'varchar', length: 120, nullable: true })
  payoutReference: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  // When KHS approved or rejected it.
  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  // The ledger row the request took the money out of, so approving, paying or rejecting can update it.
  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}