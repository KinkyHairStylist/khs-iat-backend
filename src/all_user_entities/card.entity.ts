import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  ValueTransformer,
  ManyToOne,
} from 'typeorm';
import { GiftCard } from './gift-card.entity';
import * as crypto from 'crypto';
import { User } from './user.entity';

/**
 * AES Encryption/Decryption Transformer
 * Automatically encrypts values before saving,
 * and decrypts them when reading from the database.
 */
const IV_LENGTH = 16; // AES block size

const getKey = () => {
  const key = process.env.CARD_ENCRYPTION_KEY;
  if (!key) {
    // Fallback for local development if the key is not set
    return Buffer.from('a_32_character_secret_key_for_encryption_!', 'utf8');
  }
  return Buffer.from(key, 'base64');
};

const encrypt = (value: string): string => {
  if (!value) return value;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

const decrypt = (value: string): string => {
  if (!value) return value;
  const [ivHex, encryptedText] = value.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getKey(), iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

const encryptionTransformer: ValueTransformer = {
  to: (value: string) => encrypt(value),
  from: (value: string) => decrypt(value),
};

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

  @Column({ transformer: encryptionTransformer })
  cardNumber: string; // stored encrypted in DB

  @Column()
  expiryMonth: string; // e.g. "07"

  @Column()
  expiryYear: string; // e.g. "2027"

  @Column({ nullable: true, transformer: encryptionTransformer })
  cvv?: string; // also encrypted — do NOT expose in any API response

  @Column({ nullable: true })
  billingAddress?: string;

  @Column({ nullable: true })
  lastFourDigits?: string; // Derived from decrypted cardNumber

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

  @Column({ nullable: true })
  paystackAuthorizationCode?: string; // For Paystack recurring charges

  @Column({ nullable: true })
  paystackEmail?: string; // Email used for Paystack payment
}
