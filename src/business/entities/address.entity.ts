import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Staff } from './staff.entity';

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  location: string;

  @Column({ default: false })
  isPrimary: boolean;

  @ManyToOne(() => Staff, (staff) => staff.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_id' })
  staff: Staff;
}
