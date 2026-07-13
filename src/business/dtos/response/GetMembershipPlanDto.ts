import { IsString, IsNumber, IsBoolean, IsArray, IsOptional } from "class-validator";

export class GetMembershipPlanDto {
    @IsString()
    name: string;

    @IsString()
    id: string;

    @IsString()
    tier: string;

    @IsNumber()
    price: number;

    @IsNumber()
    saving: number;

    @IsNumber()
    sessions: number;

    @IsArray()
    @IsOptional()
    features?: string[];

    @IsBoolean()
    isPopular: boolean;

    @IsNumber()
    activeSubscribers: number;
}
