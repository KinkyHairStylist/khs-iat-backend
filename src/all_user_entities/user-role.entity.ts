import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'user_role' })
export class UserRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: false })
  isSuperAdmin: boolean;

  @Column({ default: false })
  isAdmin: boolean;

  @Column({ default: false })
  isBusiness: boolean;

  @Column({ default: true })
  isClient: boolean;

  @Column({ default: false })
  isStaff: boolean;

  @Column({ default: false })
  isManager: boolean;

  @Column({ default: false })
  isBusinessAdmin: boolean;

  @OneToOne(() => User, (user) => user.role)
  user: User;
}
