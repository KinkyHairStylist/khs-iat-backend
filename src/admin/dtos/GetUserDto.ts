

import {
    IsString,
    IsIn,
    IsBoolean,
    IsNotEmpty,
    IsOptional,
} from 'class-validator';

export class GetUserDto {

    @IsNotEmpty()
    id: string;

    @IsNotEmpty()
    name: string;

    @IsNotEmpty()
    initials: string;

    @IsNotEmpty()
    location: string;

    @IsNotEmpty()
    contactEmail: string;

    @IsNotEmpty()
    contactPhone: string;

    @IsNotEmpty()
    status: string;

    @IsNotEmpty()
    isVerified: boolean;

    @IsNotEmpty()
    joinDate: string;

    @IsNotEmpty()
    activity: string;

    @IsNotEmpty()
    bookings: number;

    @IsNotEmpty()
    spent: number;

}
