import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';

import { User } from 'src/all_user_entities/user.entity';
import { Service } from 'src/business/entities/service.entity';

@Entity('FavoriteService')
@Unique(['userId', 'serviceId']) // Prevent duplicate favorites
export class FavoriteService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  serviceId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', referencedColumnName: 'id' })
  user: User;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serviceId', referencedColumnName: 'id' })
  service: Service;

  @CreateDateColumn()
  createdAt: Date;
}