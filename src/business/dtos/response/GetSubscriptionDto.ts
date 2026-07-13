import { IsString, IsNotEmpty, IsDateString, IsNumber, IsEnum } from "class-validator";
import {Status} from "../../entities/subscription.entity";


export class GetSubscriptionDto {
    @IsString()
    @IsNotEmpty()
    user: string;

    @IsString()
    @IsNotEmpty()
    plan: string;

    @IsDateString()
    startDate: string;

    @IsDateString()
    nextBilling: string;

    @IsNumber()
    amount: number;

    @IsEnum(Status)
    status: Status;
}
