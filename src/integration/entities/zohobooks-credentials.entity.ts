import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Business } from 'src/business/entities/business.entity';

@Entity('zohobooks_credentials')
export class ZohoBooksCredentials {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  @Column({ type: 'text' })
  accessToken: string;

  @Column({ type: 'text' })
  refreshToken: string;

  @Column({ type: 'varchar' })
  organizationId: string; // Zoho Organization ID

  @Column({ type: 'bigint' })
  expiryDate: number;

  @Column({ type: 'varchar', default: 'com' })
  dataCenter: string; // com, eu, in, com.au, jp

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
