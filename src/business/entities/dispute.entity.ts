import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";
import { Appointment } from "./appointment.entity";

export enum DisputeStatus {
    OPEN = "OPEN",
    RESOLVED = "RESOLVED",
    CLOSED = "CLOSED",
}

export enum DisputeType {
    SERVICE_ISSUE = "SERVICE_ISSUE",
    PAYMENT_ISSUE = "PAYMENT_ISSUE",
    SCHEDULING_ISSUE = "SCHEDULING_ISSUE",
    OTHER = "OTHER",
}

@Entity()
export class Dispute {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => Appointment, (appointment) => appointment.id, {
        onDelete: 'CASCADE', eager: true, nullable: true,
    })
    appointment: Appointment;


    @Column({
        type: "enum",
        enum: DisputeStatus,
        default: DisputeStatus.OPEN,
    })
    status: DisputeStatus;

    @Column({
        type: "enum",
        enum: DisputeType,
        default: DisputeType.PAYMENT_ISSUE,
    })
    disputeType: DisputeType;

    @Column({ nullable: true })
    resolutionAction: string;

    @Column({ type: "text", nullable: true })
    resolutionNotes: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
