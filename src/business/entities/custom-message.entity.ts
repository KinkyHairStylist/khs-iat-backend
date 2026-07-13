import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { MESSAGE_TYPE } from '../dtos/requests/CustomMesssageDto';

@Entity('customMessages')
export class CustomMessage {
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

  @Column()
  clientPhone: string;

  @Column()
  message: string;

  @Column()
  messageSubject: string;

  @Column({
    type: 'enum',
    enum: MESSAGE_TYPE,
    default: MESSAGE_TYPE.SMS,
  })
  messageType: MESSAGE_TYPE;

  @Column({ default: false })
  sent: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
