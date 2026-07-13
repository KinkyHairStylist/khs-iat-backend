import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class MembershipTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  initialPrice: number;
  
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  availablePrice: number;

  @Column({ type: 'int', default: 30 })
  durationDays: number; 

  @Column({ type: 'int', default: 0 })
  session: number; 

  @Column({ type: 'simple-array', nullable: true })
  features: string[];

  @Column({ default: false })
  isRecommended: boolean;

  @CreateDateColumn()
  createdAt: Date;
}