import { User } from 'src/all_user_entities/user.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  JoinColumn,
  BeforeUpdate,
} from 'typeorm';
import { Gender } from '../types/constants';

export enum ClientType {
  REGULAR = 'regular',
  VIP = 'vip',
  NEW = 'new',
  ALL = 'all',
}

export enum Pronouns {
  HE_HIM = 'he-him',
  SHE_HER = 'she-her',
  THEY_THEM = 'they-them',
  OTHER = 'other',
}

export enum ClientSource {
  WALK_IN = 'walk-in',
  REFERRAL = 'referral',
  INSTAGRAM = 'instagram',
  WEBSITE = 'website',
  FACEBOOK = 'facebook',
  OTHER = 'other',
}

@Entity('clients')
@Index(['email'], { unique: true })
@Index(['owner'])
export class ClientSchema {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column({ nullable: true })
  phoneCode: string;

  @Column({
    type: 'enum',
    enum: ClientType,
    default: ClientType.REGULAR,
  })
  clientType: ClientType;

  @Column({ type: 'varchar', nullable: true })
  dateOfBirth: Date | string;

  @Column({
    type: 'enum',
    enum: Gender,
    nullable: true,
  })
  gender: Gender;

  @Column({
    type: 'enum',
    enum: Pronouns,
    nullable: true,
  })
  pronouns: Pronouns;

  @Column({ nullable: true })
  occupation: string;

  @Column({
    type: 'enum',
    enum: ClientSource,
    default: ClientSource.WALK_IN,
  })
  clientSource: ClientSource;

  @Column({ nullable: true })
  profileImage: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeUpdate()
  updateTimestamp() {
    this.updatedAt = new Date();
  }
}
