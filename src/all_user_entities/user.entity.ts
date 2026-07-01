import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { Referral } from '../user/user_entities/referrals.entity'
import { Appointment } from 'src/business/entities/appointment.entity';
import { RefreshToken } from 'src/business/entities/refresh.token.entity';
import { Business } from 'src/business/entities/business.entity';
import { Gender } from 'src/business/types/constants';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  password?: string;

  @Column({ type: 'varchar', nullable: true })
  firstName: string;

  @Column({ type: 'varchar', nullable: true })
  surname: string;

  @Column({ type: 'varchar', nullable: true })
  phoneNumber: string;

  @Column({ type: 'enum', enum: Gender,  nullable: true })
  gender: Gender;

  @Column({default:"."})
  suspensionHistory: string;

  @Column({ default: false })
  isSuspended: boolean;

  @Column({ default: false })
  isVerified: boolean;

  @OneToMany(() => Appointment, (appointment) => appointment.client,{nullable:true})
  clientAppointments: Appointment[];

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];

  @OneToMany(() => Business, (business) => business.owner)
  businesses: Business[];

  @Column({ type: 'varchar', nullable: true })
  verificationCode: string | null;

  @Column({ type: 'timestamp', nullable: true })
  verificationExpires: Date | null;

  @Column({ type: 'varchar', nullable: true })
  resetCode: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetCodeExpires: Date | null;

  @Column({default: 0})
  booking: number;

  @Column({default: 0})
  spent: number

  @Column({nullable:true,default:0})
  longitude: number;

  @Column({nullable:true,default:0})
  latitude: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({default: "just now"})
  activity: string;

  //  Relationship — one user can refer many others
  @OneToMany(() => Referral, (referral) => referral.referrer)
  referrals: Referral[];

  //  NEW: Earnings tracking
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalEarnings: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  availableEarnings: number;

  @Column({ type: 'varchar', unique: true, nullable: true })
  referralCode: string;

}