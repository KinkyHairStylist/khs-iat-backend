import {
    IsString,
    IsNotEmpty,
    IsNumber,
    Min,
    IsBoolean,
    IsArray,
    IsEnum,
    IsInt,
} from 'class-validator';
import { BillingCycle } from '../../entities/membership.entity';

export class CreateMembershipPlanDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    tier: string;

    @IsNumber()
    @Min(0)
    price: number;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsNumber()
    @Min(0)
    saving: number;

    @IsInt()
    @Min(0)
    sessions: number;

    @IsInt()
    @Min(0)
    activeSubscribers: number;

    @IsArray()
    features: string[];

    @IsBoolean()
    autoRenewalEnabled: boolean;

    @IsBoolean()
    visibleToPublic: boolean;

    @IsEnum(BillingCycle)
    billingCycle: BillingCycle;
}
