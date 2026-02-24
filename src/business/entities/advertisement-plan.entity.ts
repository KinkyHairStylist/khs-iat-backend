import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('advertising_plans')
export class AdvertisementPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  planName: string;

  @Column({ type: 'float' })
  price: number;

  @Column({ nullable: true })
  description: string;

  @Column('text', { array: true, default: [] })
  features: string[];

  @Column({ nullable: true })
  payable: string;

  @Column({ default: false })
  isRecommended: boolean;

  @Column({ nullable: true })
  boost: string;

  @Column({ nullable: true })
  durationDays: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
