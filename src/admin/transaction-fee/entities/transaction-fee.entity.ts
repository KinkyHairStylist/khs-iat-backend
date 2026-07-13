import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class TransactionFeeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Booking
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 5.0 })
  bookingPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0.5 })
  bookingFixed: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1.0 })
  bookingMin: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 50.0 })
  bookingMax: number;

  // Withdrawal
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 3.0 })
  withdrawalPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 2.0 })
  withdrawalFixed: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 5.0 })
  withdrawalMin: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 100.0 })
  withdrawalMax: number;

  // Discounts
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10.0 })
  premiumDiscount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 20.0 })
  vipDiscount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 50.0 })
  newBizDiscount: number;

  @Column({ default: true })
  volumeDiscounts: boolean;

  @Column({ default: false })
  applyToRefunds: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
