import { Entity, OneToOne, PrimaryGeneratedColumn, Column, JoinColumn } from 'typeorm';
import { User } from 'src/all_user_entities/user.entity';

@Entity()
export class UserStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn() // THIS creates userId column in the table
  user: User;

  @Column({ default: false })
  isOnline: boolean;
}
