import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SalonImage } from './salon-image.entity';
import { Appointment } from '../../business/entities/appointment.entity';

@Entity()
export class Salon {
  distance: number;

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  address: string;

  @OneToMany(() => Appointment, (appointment) => appointment.business)
  appointments: Appointment[];

  @Column('decimal', { precision: 10, scale: 8 })
  latitude: number;

  @Column('decimal', { precision: 11, scale: 8 })
  longitude: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.0 })
  rating: number;

  @Column({ type: 'int', default: 0 })
  reviewCount: number;

  @Column({ type: 'text', array: true, default: [] })
  services: string[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => SalonImage, (image) => image.salon)
  images: SalonImage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}