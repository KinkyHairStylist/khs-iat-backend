import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum ArticleSection {
  GET_STARTED = 'get_started',
  PAYMENT_METHOD = 'payment_method',
  BOOKING_MANAGEMENT = 'booking_management',
}

@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ArticleSection,
    default: ArticleSection.GET_STARTED,
  })
  section: ArticleSection;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column({ nullable: true })
  fileUrl?: string;

  @ManyToOne(() => User, { 
    eager: true, 
    onDelete: 'SET NULL', 
    nullable: true 
  })
  author: User;

  @CreateDateColumn()
  createdAt: Date;
}
