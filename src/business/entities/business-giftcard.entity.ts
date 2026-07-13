import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import {
  BusinessGiftCardStatus,
  BusinessGiftCardTemplate,
  BusinessSentStatus,
  BusinessGiftCardSoldStatus,
} from '../enum/gift-card.enum';
import { Business } from './business.entity';
import { User } from 'src/all_user_entities/user.entity'
import { Card } from 'src/all_user_entities/card.entity'

@Entity('business_gift_cards')
export class BusinessGiftCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'ownerId' }) 
  owner?: User; 

  @Column({ type: 'uuid', name: 'ownerId', nullable: true })
  @Index()
  ownerId?: string;

  // denormalized owner info for quick access / queries which is gotten from owners ID
  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  ownerEmail?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ownerFullName?: string;

  @Column({ type: 'uuid' })
  @Index()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.giftCards, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  remainingAmount: number;

  @Column({ type: 'simple-array' })
  benefits: string[];

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @ManyToOne(() => Card, { eager: true })
  @JoinColumn({ name: 'cardId' })
  card: Card;
  
  @Column({ type: 'uuid', name: 'cardId', nullable: true })
  @Index()
  cardId?: string; // Selected payment method

  @Column({ type: 'enum', enum: BusinessGiftCardTemplate })
  template: BusinessGiftCardTemplate;

  @Column({ type: 'int', default: 365 })
  expiryInDays: number;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  redeemedAt: Date;

  @Column({
    type: 'enum',
    enum: BusinessGiftCardStatus,
    default: BusinessGiftCardStatus.ACTIVE,
  })
  status: BusinessGiftCardStatus;

  @Column({
    type: 'enum',
    enum: BusinessGiftCardSoldStatus,
    default: BusinessGiftCardSoldStatus.AVAILABLE,
  })
  soldStatus: BusinessGiftCardSoldStatus;

  @Column({
    type: 'enum',
    enum: BusinessSentStatus,
    default: BusinessSentStatus.SENT,
  })
  sentStatus: BusinessSentStatus;

  @Column({ type: 'varchar', length: 255 })
  recipientName: string;

  @Column({ type: 'varchar', length: 255 })
  recipientEmail: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'text', nullable: true, default: 'AUD' })
  currency: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  senderName: string;

  @Column({ nullable: true })
  comment?: string;
  
  @Column({ nullable: true })
  clientPersonalMessage?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  setCurrentBalance() {
    // If currentBalance is not set, use amount
    if (this.remainingAmount === null || this.remainingAmount === undefined) {
      this.remainingAmount = Number(this.amount);
    }
  }
}
