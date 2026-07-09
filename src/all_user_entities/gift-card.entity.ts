import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { randomBytes } from 'crypto';

import { User } from './user.entity';
import { Card } from './card.entity';

export enum GiftCardStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
  USED = 'Used',
  EXPIRED = 'Expired',
}

@Entity()
export class GiftCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  sender: User;

  @Column()
  recipientName: string;

  @Column()
  recipientEmail: string;

  @Column()
  senderName: string;

  @Column({ nullable: true })
  personalMessage?: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'float', nullable: true })
  currentBalance: number;

  @Column({ type: 'date', nullable: true})
  purchaseDate: string;

  @ManyToOne(() => Card, { eager: true })
  card: Card; // Selected payment method

  @Column({
    type: 'enum',
    enum: GiftCardStatus,
    default: GiftCardStatus.ACTIVE,
  })
  status: GiftCardStatus;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date; // Auto-set to 7 days from creation

  @Column({ type: 'timestamp', nullable: true })
  usedAt?: Date; // When the gift card was redeemed

  @CreateDateColumn()
  createdAt: Date;

  @Column({ unique: true })
  code: string;

  @Column({ nullable: true })
  comment?: string;

  @BeforeInsert()
  generateDefaults() {
    // Generate a 10-character random alphanumeric code
    this.code = randomBytes(5).toString('hex').toUpperCase();
  }

  @BeforeInsert()
  setCurrentBalance() {
    // If currentBalance is not set, use amount
    if (this.currentBalance === null || this.currentBalance === undefined) {
      this.currentBalance = Number(this.amount);
    }
  }
}
