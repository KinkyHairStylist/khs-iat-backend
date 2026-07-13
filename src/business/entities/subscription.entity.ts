import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";
import { User } from 'src/all_user_entities/user.entity';
import { MembershipPlan } from "./membership.entity";


export enum Status {
    ACTIVE = "Active",
    CANCELLED = "Cancelled",

}

@Entity()
export class Subscription {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => User, (user) => user.id, { eager: true })
    user: User;


    @ManyToOne(() => MembershipPlan, (plan) => plan.id, { eager: true })
    plan: MembershipPlan;

    @Column()
    duration: number;

    @Column({ type: "timestamptz" })
    nextBilling: Date;


    @Column({ type: "timestamptz" })
    startDate: Date;

    @Column({
        type: "enum",
        enum: Status,
        default: Status.ACTIVE,
    })
    status: Status;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
