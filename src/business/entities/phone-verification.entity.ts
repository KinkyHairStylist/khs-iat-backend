import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('phone_verifications')
export class PhoneVerification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ unique: true })
  phoneNumber!: string;

  @Column({ length: 6 })
  otp!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ default: 0 })
  trials!: number;

  @Column({ default: 5 })
  maxTrials!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
