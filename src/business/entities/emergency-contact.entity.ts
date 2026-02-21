import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { Staff } from "./staff.entity";

@Entity('emergency_contacts')
export class EmergencyContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column()
  relationship: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @ManyToOne(() => Staff, (staff) => staff.emergencyContacts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: "staff_id" })
  staff: Staff;
}
