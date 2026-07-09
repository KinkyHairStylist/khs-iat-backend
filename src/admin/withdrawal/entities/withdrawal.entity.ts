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

  @Column({ default: 'Pending' })
  status: 'Pending' | 'Processing' | 'Completed' | 'Rejected';

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  currentBalance: number;

  @Column({ nullable: true })
  requestDate: string;

  @Column({ nullable: true })
  timeAgo: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}