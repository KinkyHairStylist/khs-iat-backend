import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Business } from './business.entity';

// Mirrors Stripe's own subscription status vocabulary 1:1 so webhook
// handlers are a straight assignment, not a translation table.
export enum MerchantSubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}

// How the merchant started: on the Trial (not tied to a plan), inside the MVP
// window with a shared end date, or paying for a plan.
export enum MerchantSubscriptionKind {
  TRIAL = 'trial',
  REVEAL = 'reveal',
  PAID = 'paid',
}

// One row per business — KHS's own billing relationship with the merchant
// (Starter/Growth/Pro trial + paid subscription), separate from the
// unrelated client-facing "membership" feature. Stripe itself is the
// durable historical record (invoices, retries) via the two Stripe ID
// columns below; this table only tracks current state.
@Entity('merchant_subscriptions')
export class MerchantSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  @Index()
  businessId: string;

  @OneToOne(() => Business, (business) => business.merchantSubscription, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({
    type: 'enum',
    enum: MerchantSubscriptionStatus,
    default: MerchantSubscriptionStatus.TRIALING,
  })
  status: MerchantSubscriptionStatus;

  // Added by scripts/add-merchant-subscription-kind-column.ts. Rows that already exist
  // are 'trial', or 'paid' if they already have a Stripe subscription.
  @Column({ type: 'varchar', length: 20, default: MerchantSubscriptionKind.TRIAL })
  kind: MerchantSubscriptionKind;

  // For a trial this is the end of the trial; for MVP it is the window's
  // shared end date (kept in step when an admin adds days).
  @Column({ type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  // Set on the FIRST invoice.payment_failed for this row, never reset by
  // Stripe's own repeated retries of the same invoice — this is the
  // anchor the grace-period cron measures against.
  @Column({ type: 'timestamptz', nullable: true })
  pastDueSince: Date | null;

  @Column({ type: 'varchar', nullable: true })
  stripeCustomerId: string | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  stripeSubscriptionId: string | null;

  // Debug/admin visibility only — nothing reads this to drive logic.
  @Column({ type: 'varchar', nullable: true })
  cancelReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
