import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  JoinTable,
  ManyToMany,
} from 'typeorm';

import { Service } from './service.entity'
import { User } from 'src/all_user_entities/user.entity';
import { Business } from './business.entity';
import { Staff } from './staff.entity';
import { ClientSchema } from './client.entity';

export enum AppointmentStatus {
  CONFIRMED = 'Confirmed',
  PENDING = 'Pending',
  CANCELLED = 'Cancelled',
  COMPLETED = 'Completed',
  RESCHEDULED = 'Rescheduled',
}

export enum PaymentStatus {
  PAID = 'Paid',
  UNPAID = 'Unpaid',
}

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Client (signed-up platform user) — set for self-service bookings made
  // by a customer through their own account.
  @ManyToOne(() => User, (user) => user.clientAppointments, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'client_id' })
  client?: User;

  // Business client (CRM record under Client Management) — set for bookings
  // a merchant creates on behalf of a client who may not have a platform
  // account (walk-ins etc).
  @ManyToOne(() => ClientSchema, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'business_client_id' })
  businessClient?: ClientSchema;

  @Column({ type: 'varchar', nullable: true })
  orderId: string;

  @ManyToMany(() => Staff, { eager: true })
  @JoinTable({
    name: 'appointment_staff',
    joinColumn: { name: 'appointment_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'staff_id', referencedColumnName: 'id' },
  })
  staff: Staff[];

  // Business
  @ManyToOne(() => Business, (business) => business.appointments, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'business_id' })
  business: Business;

  // Appointment details
  @Column({ type: 'varchar', nullable: true })
  googleEventId: string;

  @Column()
  serviceName: string;

  @Column()
  date: string; // e.g. "2024-01-15"

  @Column()
  time: string; // e.g. "2:00 PM"

  @Column()
  duration: string; // e.g. "4:00 PM (120 min)"

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.PENDING,
  })
  status: AppointmentStatus;

  // Payment details
  @Column({ type: 'float', default: 0 })
  amount: number;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  paymentStatus: PaymentStatus;

  // Client confirming their own intent to attend (distinct from the
  // salon-side AppointmentStatus.CONFIRMED, which the merchant sets).
  @Column({ type: 'timestamptz', nullable: true })
  clientConfirmedAt?: Date;

  // Optional Notes
  @Column({ type: 'text', nullable: true })
  specialRequests?: string;

  @Column({ type: 'text', nullable: true })
  cancellationsNote?: string;

  // When this appointment was cancelled — separate from updatedAt, which
  // changes on every unrelated edit (reschedule, restore, staff change).
  // Needed to sort/list cancelled bookings by actual cancellation recency.
  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt?: Date;

  // Staged new date/time for a Rebook of a Cancelled appointment. Kept
  // separate from date/time so an abandoned rebook (never paid) leaves the
  // original cancelled booking completely untouched — these are only
  // promoted into date/time once payment actually succeeds.
  @Column({ type: 'varchar', nullable: true })
  pendingRebookDate?: string;

  @Column({ type: 'varchar', nullable: true })
  pendingRebookTime?: string;

  // Appointment timeline
  @Column({
    type: 'jsonb',
    nullable: true,
    default: () => `'[]'`,
  })
  timeline: {
    actor: string;
    action: string;
    timestamp: string;
  }[] = [];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  zohoInvoiceId?: string;

  @Column({ type: 'varchar', nullable: true })
  zohoCustomerId?: string;
  
  @ManyToOne(() => Service, (service) => service.appointments, {
    nullable: true,
    eager: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'service_id' })
  service: Service;
}
