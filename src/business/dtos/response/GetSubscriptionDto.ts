import { IsString, IsNotEmpty, IsDateString, IsNumber, IsEnum, IsOptional, IsArray } from "class-validator";
import { Status } from "../../entities/subscription.entity";

export class GetSubscriptionDto {
    @IsOptional()
    @IsString()
    id?: string;

    @IsString()
    @IsNotEmpty()
    user: string;

    @IsOptional()
    @IsString()
    userEmail?: string;

    @IsOptional()
    @IsString()
    userPhone?: string;

    @IsString()
    @IsNotEmpty()
    plan: string;

    @IsOptional()
    @IsString()
    tier?: string;

    @IsDateString()
    startDate: string;

    @IsDateString()
    nextBilling: string;

    @IsNumber()
    amount: number;

    @IsEnum(Status)
    status: Status;

    @IsOptional()
    @IsNumber()
    totalSessions?: number;

    @IsOptional()
    @IsNumber()
    usedSessions?: number;

    @IsOptional()
    @IsNumber()
    remainingSessions?: number;

    @IsOptional()
    @IsString()
    planDescription?: string;

    @IsOptional()
    @IsArray()
    planFeatures?: string[];

    @IsOptional()
    @IsString()
    billingCycle?: string;
}
