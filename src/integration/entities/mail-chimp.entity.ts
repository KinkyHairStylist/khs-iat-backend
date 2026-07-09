import { Business } from 'src/business/entities/business.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('mailchimp_credentials')
export class MailchimpCredentials {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'text' })
  apiKey: string;

  @Column({ type: 'varchar' })
  serverPrefix: string; // e.g., 'us1', 'us19'

  @Column({ type: 'varchar', nullable: true })
  audienceId: string; // List ID for contacts

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
