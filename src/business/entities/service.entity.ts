import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToMany,
  ManyToMany
} from 'typeorm';

import { Business } from './business.entity';
import { Staff } from './staff.entity';
import { AdvertisementPlan } from './advertisement-plan.entity';
import { Appointment } from './appointment.entity'
import { BusinessCategory } from '../types/category.enum';
import { ServiceType } from '../types/service-type.enum';

@Entity('Service')
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'enum', enum: BusinessCategory, nullable: true })
  category: BusinessCategory;

  @Column({ type: 'enum', enum: ServiceType, nullable: true })
  serviceType: ServiceType;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  price: number;

  @Column({ nullable: true })
  duration: string;

  @Column('text', { array: true, nullable: true })
  images: string[];

  @ManyToOne(() => AdvertisementPlan, { eager: true, nullable: true })
  @JoinColumn({ name: 'advertisementPlanId' })
  advertisementPlan: AdvertisementPlan;

  @ManyToOne(() => Business, (business) => business.serviceList, { nullable: true })
  business: Business;

  @ManyToMany(() => Staff, (staff) => staff.services, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  assignedStaff: Staff[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Appointment, (appointment) => appointment.service,{nullable: true})
  appointments: Appointment[];
}
