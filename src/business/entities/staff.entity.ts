import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  ManyToMany,
} from 'typeorm';
import { Business } from './business.entity';
import { Service } from './service.entity';
import { Address } from './address.entity';
import { EmergencyContact } from './emergency-contact.entity';
import { BusinessStaffRole } from 'src/middleware/business-staff-role.enum';

@Entity('staff')
export class Staff {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true, unique: true  })
  email: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  dob: string;

  @Column({ nullable: true })
  jobTitle: string;

  @Column({
    type: 'enum',
    enum: BusinessStaffRole,
    default: BusinessStaffRole.STYLIST,
  })
  role: BusinessStaffRole;

  // Links this staff profile to a User account (set when merchant invites a user)
  @Column({ type: 'varchar', nullable: true, unique: true })
  userId: string | null;

  @Column({ nullable: true })
  specialization: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ nullable: true })
  experienceYears: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  employmentType: string;

  @Column({ nullable: true })
  startDate: Date;

  @Column({
    type: 'jsonb',
    nullable: true,
    default: () => "'{}'",
  })
  settings:any

  @Column('simple-array', { nullable: true })
  servicesAssigned: string[];

  @ManyToMany(() => Service, (service) => service.assignedStaff)
  services: Service[];

  // Not eager: Staff is nested under Appointment.staff (ManyToMany, eager),
  // so eager-loading these OneToMany collections here multiplies every
  // appointment row by each address/contact row (cartesian join). Callers
  // that need them request them explicitly via `relations`.
  @OneToMany(() => Address, (address) => address.staff, {
    cascade: true,
  })
  addresses: Address[];

  @OneToMany(() => EmergencyContact, (contact) => contact.staff, {
    cascade: true,
  })
  emergencyContacts: EmergencyContact[];

  @ManyToOne(() => Business, (business) => business.staff, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'business_id' })
  business: Business;
}
