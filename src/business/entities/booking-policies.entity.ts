import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Business } from './business.entity';

@Entity('booking_policies')
export class BookingPolicies {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  minimumLeadTime: number; // minutes

  @Column({ type: 'int' })
  bufferTime: number; // minutes

  @Column({ type: 'int' })
  cancellationWindow: number; // hours

  @Column({ default: false })
  requireDepositAmount: boolean;

  @OneToOne(() => Business, (business) => business.bookingPolicies, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  business: Business;
}
