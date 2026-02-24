import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
    JoinColumn,
} from 'typeorm';
import { ClientSchema } from './client.entity';
import { Staff } from './staff.entity';

@Entity('emergency_contacts_schema')
export class EmergencyContactSchema {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'client_id' })
    clientId: string;

    @ManyToOne(() => ClientSchema, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'client_id' })
    client: ClientSchema;

    @Column({ nullable: true, default: 'No Name' })
    firstName: string;

    @Column({ nullable: true, default: 'No Name' })
    lastName: string;

    @Column({ nullable: true, default: 'No Email' })
    email: string;

    @Column({ nullable: true, default: 'None' })
    relationship: string;

    @Column({ nullable: true, default: 'None' })
    phone: string;

    @Column({ nullable: true, default: 'None' })
    emergencyPhoneCode: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => Staff, (staff) => staff.emergencyContacts, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'staff_id' })
    staff: Staff;
}
