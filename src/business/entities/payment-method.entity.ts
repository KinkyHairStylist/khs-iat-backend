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
