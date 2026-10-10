import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SystemAlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum SystemAlertAudience {
  MERCHANT = 'merchant',
  CUSTOMER = 'customer',
  ALL = 'all',
}

// Platform-wide banner an admin can broadcast to merchants and/or
// customers — e.g. planned maintenance, a policy change, an incident
// notice. Distinct from SlackEventType/ERROR_ALERT (internal ops
// alerting) and the systemAlerts boolean on platform settings (a mute
// toggle, not a message).
@Entity('system_alerts')
export class SystemAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: SystemAlertSeverity, default: SystemAlertSeverity.INFO })
  severity: SystemAlertSeverity;

  @Column({ type: 'enum', enum: SystemAlertAudience, default: SystemAlertAudience.ALL })
  audience: SystemAlertAudience;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
