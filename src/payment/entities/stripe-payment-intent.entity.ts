import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum StripeEscrowStatus {
  PENDING = 'pending',
  HELD = 'held',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Tracks the escrow lifecycle of a single Stripe PaymentIntent for a
// booking: funds are captured by Stripe/KHS at HELD, but only credited to
// the business wallet (RELEASED) once the appointment is marked Completed
// — unlike the existing Paystack flow, which credits the wallet the moment
// payment clears. See BookingService.confirmBooking's 'stripe' branch and
// BusinessService.completeBooking's release hook.
@Entity('stripe_payment_intents')
export class StripePaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  orderId: string;

  @Index()
  @Column({ type: 'uuid' })
  businessId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  stripePaymentIntentId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripeChargeId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'usd' })
  currency: string;

  // Service amount only — excludes feeAmount, matching how the business
  // wallet is credited on release (fee stays platform revenue).
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  bookingAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  feeAmount: number;

  @Column({
    type: 'enum',
    enum: StripeEscrowStatus,
    default: StripeEscrowStatus.PENDING,
  })
  status: StripeEscrowStatus;

  @Column({ type: 'timestamptz', nullable: true })
  heldAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  transactionId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
