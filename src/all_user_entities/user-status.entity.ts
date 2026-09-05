import { Entity, OneToOne, PrimaryGeneratedColumn, Column, JoinColumn } from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';

@Entity()
export class UserStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userId: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: false })
  isOnline: boolean;
}
