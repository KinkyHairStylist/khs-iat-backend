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

  // Client (User)
  @ManyToOne(() => User, (user) => user.clientAppointments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'client_id' })
  client: User;

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

  // Optional Notes
  @Column({ type: 'text', nullable: true })
  specialRequests?: string;

  @Column({ type: 'text', nullable: true })
  cancellationsNote?: string;

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
  }[];

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
