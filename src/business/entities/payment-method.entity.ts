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
