import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { ClientSchema, ClientType } from './client.entity';

export enum PreferredContactMethod {
  EMAIL = 'email',
  SMS = 'sms',
  PHONE = 'phone',
}

export enum Languages {
  ENGLISH = 'en',
  FRENCH = 'fr',
  SPANISH = 'es',
  GERMAN = 'de',
  CHINESE = 'zh',
  // add more as needed
}

// Example timezone enum
export enum Timezone {
  SYDNEY = 'Australia/Sydney',
  MELBOURNE = 'Australia/Melbourne',
  BRISBANE = 'Australia/Brisbane',
  PERTH = 'Australia/Perth',
  ADELAIDE = 'Australia/Adelaide',
  UTC = 'UTC',
  NEW_YORK = 'America/New_York',
  LONDON = 'Europe/London',
  TOKYO = 'Asia/Tokyo',
  // add more as needed
}

@Entity('client_settings')
@Index(['clientType'])
export class ClientSettingsSchema {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @OneToOne(() => ClientSchema, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: ClientSchema;

  @Column({ default: true })
  emailNotifications: boolean;

  @Column({ default: true })
  smsNotifications: boolean;

  @Column({ default: false })
  marketingEmails: boolean;

  @Column({
    type: 'enum',
    enum: ClientType,
    default: ClientType.REGULAR,
  })
  clientType?: ClientType;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'jsonb',
    default: {
      preferredContactMethod: 'email',
      language: 'en',
      timezone: 'Australia/Sydney',
    },
  })
  preferences: {
    preferredContactMethod: PreferredContactMethod;
    language: Languages;
    timezone: Timezone;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
