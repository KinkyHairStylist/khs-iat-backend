import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';

export enum TicketStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  ticketNumber: string;

  @ManyToOne(() => User)
  customer: User;

  @ManyToOne(() => User, { nullable: true })
  assignedAdmin?: User;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @ManyToOne(() => User, { nullable: true })
  closedBy?: User;

  @Column({ type: 'timestamp', nullable: true })
  closedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
