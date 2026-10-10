import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import {
  WalletCurrency,
  WalletStatus,
} from 'src/payment/enums/wallet.enum';
import { Business } from './business.entity';
import { Transaction } from './transaction.entity';
import { WalletPaymentMethod } from './payment-method.entity';

@Entity('business_wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  businessId: string;

  @OneToOne(() => Business, (business) => business.wallet, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' }) // this side owns the relation
  business: Business;

  @Column({ type: 'uuid' })
  @Index()
  ownerId: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  balance: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalIncome: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  totalExpenses: number;

  @Column({
    type: 'enum',
    enum: WalletCurrency,
  })
  currency: WalletCurrency;

  @Column({
    type: 'enum',
    enum: WalletStatus,
    default: WalletStatus.ACTIVE,
  })
  status: WalletStatus;

  // Stripe-sourced booking earnings sit here for 48h after completion
  // (see WalletReleaseCronService) before moving to balance — a payout
  // hold so a chargeback landing in that window is recovered from money
  // never handed out, instead of clawing back an already-released balance.
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  pendingBalance: number;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(
    () => WalletPaymentMethod,
    (WalletPaymentMethod) => WalletPaymentMethod.wallet,
    {
      cascade: true,
    },
  )
  paymentMethods: WalletPaymentMethod[];

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];

  // You would typically have relations to Business and User entities
  // @ManyToOne(() => Business, (business) => business.wallets)
  // @JoinColumn({ name: 'businessId' })
  // business: Business;

  // @ManyToOne(() => User, (user) => user.wallets)
  // @JoinColumn({ name: 'ownerId' })
  // owner: User;
}
