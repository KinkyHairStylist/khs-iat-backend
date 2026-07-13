import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { COMMUNICATION_MESSAGE_TYPE } from '../dtos/requests/CommunicationDto';

@Entity('communications')
export class Communication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  clientId: string;

  @Column({ nullable: true })
  businessId: string;

  @Column({ nullable: true })
  clientName: string;

  @Column({ nullable: true })
  clientEmail: string;

  @Column()
  message: string;

  @Column()
  messageSubject: string;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  recipients: {
    clientId: string;
    clientName: string;
    clientEmail: string;
  }[];

  @Column({
    type: 'enum',
    enum: COMMUNICATION_MESSAGE_TYPE,
    default: COMMUNICATION_MESSAGE_TYPE.EMAIL,
  })
  messageType: COMMUNICATION_MESSAGE_TYPE;

  @Column({ default: false })
  sent: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
