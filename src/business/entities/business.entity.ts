import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';
import { BookingPolicies } from './booking-policies.entity';
import { BookingDay } from './booking-day.entity';
import { CompanySize } from '../types/constants';
import { Appointment } from './appointment.entity';
import { Staff } from './staff.entity';
import { BlockedTimeSlot } from './blocked-time-slot.entity';
import { Service } from './service.entity';
import { Wallet } from './wallet.entity';
import { Product } from '../../marketplace/entity/product.entity';
import { BusinessGiftCard } from './business-giftcard.entity';
import { BusinessOwnerSettings } from './business-owner-settings.entity';
import { Withdrawal } from 'src/admin/withdrawal/entities/withdrawal.entity';

export enum BusinessStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  UNDER_REVIEW = 'under_review',
  SUSPENDED = 'suspended',
}

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  businessName: string;

  @Column()
  description: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, (user) => user.businesses, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ nullable: true })
  ownerName: string;

  @Column({ nullable: true })
  ownerEmail: string;

  @Column({ nullable: true })
  ownerPhone: string;

  @Column()
  primaryAudience: string;

  @OneToMany(() => Appointment, (appointment) => appointment.business, {
    cascade: true,
    nullable: true,
  })
  appointments: Appointment[];

  // Keep both service array and Service entity relation as-is
  @Column('text', { array: true, default: [] })
  service: string[];

  @OneToMany(() => Service, (service) => service.business, {
    cascade: true,
    eager: true,
  })
  serviceList: Service[];

  @Column({ type: 'jsonb', nullable: true })
  category?: string[];
  
  @Column({ nullable: true })
  businessAddress: string;

  @Column({ type: 'simple-array', nullable: true })
  businessImage?: string[];

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @OneToOne(() => BookingPolicies, (policies) => policies.business, {
    cascade: true,
    eager: true,
  })
  bookingPolicies: BookingPolicies;

  @Column({ type: 'enum', enum: CompanySize })
  companySize: CompanySize;

  @OneToMany(() => BookingDay, (day) => day.business, {
    cascade: true,
    eager: true,
  })
  bookingHours: BookingDay[];

  @Column('text', { array: true, default: [] })
  howDidYouHear: string[];

  @Column({
    type: 'enum',
    enum: BusinessStatus,
    default: BusinessStatus.PENDING,
  })
  status: BusinessStatus;

  @Column({ type: 'float', default: 0 })
  revenue: number;

  @Column({ type: 'int', default: 0 })
  bookings: number;

  @OneToMany(() => Staff, (staff) => staff.business, { cascade: true })
  staff: Staff[];

  @Column({ type: 'varchar', default: 'Free' })
  plan: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    default: () =>
      `'{"rating":0,"reviews":0,"completionRate":0,"avgResponseMins":0}'`,
  })
  performance: {
    rating: number;
    reviews: number;
    completionRate: number;
    avgResponseMins: number;
  };

  @OneToMany(() => BlockedTimeSlot, (slot) => slot.business, { cascade: true })
  blockedSlots: BlockedTimeSlot[];

  @OneToOne(() => Wallet, (wallet) => wallet.business, { cascade: true })
  wallet: Wallet;

  @OneToOne(
    () => BusinessOwnerSettings,
    (ownerSettings) => ownerSettings.business,
    {
      cascade: true,
    },
  )
  ownerSettings: BusinessOwnerSettings;

  @OneToMany(() => Product, (product) => product.business)
  products: Product[];

  @OneToMany(() => BusinessGiftCard, (giftcard) => giftcard.business)
  giftCards: BusinessGiftCard[];

  @OneToMany(() => Withdrawal, (w) => w.business)
  withdrawals: Withdrawal[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
