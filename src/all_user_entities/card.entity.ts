import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { GiftCard } from './gift-card.entity';
import { User } from './user.entity';

@Entity()
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerName: string; // e.g. "Visa", "MasterCard", "PayPal"

  @Column()
  type: string; // e.g. "credit", "debit", "digital-wallet"

  @Column()
  cardHolderName: string;

  @Column()
  expiryMonth: string; // e.g. "07"

  @Column()
  expiryYear: string; // e.g. "2027"

  @Column({ nullable: true })
  billingAddress?: string;

  @Column({ nullable: true })
  lastFourDigits?: string;

  @OneToMany(() => GiftCard, (giftCard) => giftCard.card)
  giftCards: GiftCard[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.cards, {
    onDelete: 'CASCADE',
  })
  user: User;

  @Column({ default: false })
  isDefault: boolean;

  // The reusable token from Paystack's authorization object — this is what
  // actually lets KHS charge this card again. The raw card number and CVV
  // are never sent to this backend at all (see CardService.createCard) and
  // so are never stored here, encrypted or otherwise.
  @Column({ nullable: true })
  paystackAuthorizationCode?: string;

  @Column({ nullable: true })
  paystackEmail?: string;
}
