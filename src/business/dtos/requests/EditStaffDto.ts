import {IsString, IsOptional, IsArray, IsEmail, IsObject} from 'class-validator';

export class EditStaffDto {
    @IsString()
    @IsOptional()
    firstName?: string;

    @IsString()
    @IsOptional()
    lastName?: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    phoneNumber?: string;

    @IsString()
    @IsOptional()
    gender?: string;

    @IsString()
    @IsOptional()
    dob?: string;

    @IsString()
    @IsOptional()
    jobTitle?: string;

    @IsString()
    @IsOptional()
    employmentType?: 'full-time' | 'part-time' | 'contract';

    @IsArray()
    addresses?:any;

    @IsOptional()
    settings?: any;

    @IsArray()
    @IsOptional()
    emergencyContacts?: any;

    @IsString()
    @IsOptional()
    avatar?: string;

    @IsArray()
    @IsOptional()
    servicesAssigned?: string[];

    @IsString()
    @IsOptional()
    selectedLocation?: string;
}