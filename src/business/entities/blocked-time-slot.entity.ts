import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Business } from './business.entity';

@Entity('blocked_time_slots')
export class BlockedTimeSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Business, (business) => business.blockedSlots, {
    onDelete: 'CASCADE',
  })
  business: Business;

  @Column({ type: 'varchar', nullable: true })
  type: string;

  @Column({ type: 'varchar', nullable: true })
  title: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column({ type: 'varchar', nullable: true })
  teamMember: string;

  @Column({ type: 'varchar', nullable: true })
  description: string;
}
