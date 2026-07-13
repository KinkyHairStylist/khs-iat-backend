import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../all_user_entities/user.entity';
import { MembershipTier } from './membership-tier.entity';

@Entity()
export class MembershipSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => MembershipTier, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tierId' })
  tier: MembershipTier;

  @Column()
  tierId: string;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date' })
  endDate: Date;

  @Column({ type: 'int', default: 0 })
  remainingSessions: number;

  @Column({ default: 'active' })
  status: 'active' | 'expired' | 'cancelled';

  @Column({ nullable: true })
  nextBillingDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monthlyCost: number;

  @Column({ nullable: true })
  cancelledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
