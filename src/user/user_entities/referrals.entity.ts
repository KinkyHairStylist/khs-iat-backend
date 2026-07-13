import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../all_user_entities/user.entity';

@Entity()
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The user who made the referral
  @ManyToOne(() => User, (user) => user.referrals, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrerId' })
  referrer: User;

  @Column({ type: 'uuid' })
  referrerId: string;

  // The email (or id) of the user who was referred
  @Column({ type: 'varchar', nullable: true })
  referredEmail: string;

  // Optional: link to actual registered user if they signed up
  @Column({ type: 'uuid', nullable: true })
  referredUserId: string | null;

  // Referral status
  @Column({ type: 'varchar', default: 'pending' })
  status: 'pending' | 'completed' | 'rewarded';

  // Optional: referral code
  @Column({ type: 'varchar', nullable: true })
  referralCode: string | null;

  // 👇 NEW: Earnings (₦20 per successful referral)
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 20 })
  earning: number;

  // Track if earnings have been paid to the referrer
  @Column({ default: false })
  isPaid: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
