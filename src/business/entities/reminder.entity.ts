import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { REMINDER_MODE, REMINDER_TYPE } from '../dtos/requests/Reminder.dto';

@Entity('reminders')
export class Reminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  clientId: string;

  @Column({ nullable: true })
  businessId: string;

  @Column()
  clientName: string;

  @Column()
  clientEmail: string;

  @Column({ nullable: true })
  clientPhone: string;

  @Column()
  date: string; // Appointment date

  @Column()
  time: string; // Appointment time

  @Column()
  message: string;

  @Column({
    type: 'enum',
    enum: REMINDER_MODE,
    default: REMINDER_MODE.EMAIL,
  })
  mode: REMINDER_MODE;

  @Column({
    type: 'enum',
    enum: REMINDER_TYPE,
    default: REMINDER_TYPE.UPCOMING,
  })
  reminderType: REMINDER_TYPE;

  @Column({ default: false })
  sent: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
