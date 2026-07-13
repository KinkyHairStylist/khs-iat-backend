import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
// @ts-ignore
import { Business } from './business.entity';

@Entity('booking_days')
export class BookingDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  day:
    | 'Monday'
    | 'Tuesday'
    | 'Wednesday'
    | 'Thursday'
    | 'Friday'
    | 'Saturday'
    | 'Sunday';

  @Column({ default: false })
  isOpen: boolean;

  @Column({ type: 'time', default: '09:00' })
  startTime: string;

  @Column({ type: 'time', default: '17:00' })
  endTime: string;

  @ManyToOne(() => Business, (business) => business.bookingHours, {
    onDelete: 'CASCADE',
  })
  business: Business;
}
