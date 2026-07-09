import {
  Entity,
  BeforeInsert,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';

export enum ReportType {
  REVIEW = 'Review',
  PROFILE = 'Profile',
  BUSINESS = 'Business',
}

export enum ReportSeverity {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
}

export enum ReportStatus {
  PENDING = 'Pending',
  APPROVED = 'Approved',
  REJECTED = 'Rejected',
  UNDER_REVIEW = 'Under review',
}

export enum ReporterType {
  ADMIN_SYSTEM = 'Admin System',
  USER = 'User',
}

@Entity()
export class FlaggedContent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  ref: string;

  @Column({ type: 'varchar' })
  type: ReportType;

  @Column({ type: 'text' })
  preview: string;

  // Reporter Relationship (optional if System)
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reporterId' })
  reporter: User | null;

  @Column({ type: 'uuid', nullable: true })
  reporterId: string | null;

  // Reported User Relationship
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reportedId' })
  reported: User;

  @Column({ type: 'uuid', nullable: true })
  reportedId: string;

  // Indicates if reporter was user/admin/system
  @Column({ type: 'varchar', default: 'Admin System' })
  reporterType: ReporterType;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'varchar', nullable: true })
  severity: ReportSeverity;

  @Column({ type: 'varchar', default: 'Pending' })
  status: ReportStatus;

  @CreateDateColumn()
  createdAt: Date;

  @BeforeInsert()
  generateRef() {
    const randomNumber = Math.floor(100000 + Math.random() * 900000); // 6-digit
    this.ref = `PRT-${randomNumber}`;
  }
}
