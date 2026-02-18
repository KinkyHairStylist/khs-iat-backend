import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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
}
