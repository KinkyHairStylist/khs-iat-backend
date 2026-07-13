import { IsString, IsNumber, IsOptional, IsEnum } from "class-validator";
import { AppointmentStatus, PaymentStatus } from "../../entities/appointment.entity";

export class CreateBookingDto {
    @IsString()
    businessId: string;

    @IsString()
    serviceName: string;

    @IsString()
    date: string;

    @IsString()
    time: string;

    @IsString()
    duration: string;

    @IsNumber()
    amount: number;

    @IsEnum(PaymentStatus)
    @IsOptional()
    paymentStatus?: PaymentStatus = PaymentStatus.UNPAID;

    @IsString()
    @IsOptional()
    specialRequests?: string;

    @IsOptional()
    staffIds?: string[];
}
