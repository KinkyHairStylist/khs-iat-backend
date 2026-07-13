import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";

export enum BillingCycle {
    MONTHLY = "MONTHLY",
    YEARLY = "YEARLY",

}

@Entity()
export class MembershipPlan {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    name: string;

    @Column()
    tier: string;

    @Column("decimal", { precision: 10, scale: 2 })
    price: number;

    @Column()
    saving: number;

    @Column()
    sessions: number;

    @Column("simple-array", { nullable: true })
    features: string[];

    @Column({default: false})
    isPopular: boolean;

    @Column({ nullable: true })
    cancellation: string;

    @Column()
    activeSubscribers: number;

    @Column()
    description: string;

    @Column()
    billingCycle: BillingCycle;

    @Column({default: true})
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
