import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';

@Entity()
export class AdminInvite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  expiresAt: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  invitedBy: User;

  @CreateDateColumn()
  createdAt: Date;
}