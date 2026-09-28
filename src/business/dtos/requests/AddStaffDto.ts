import {IsString, IsOptional, IsArray, IsEmail, IsObject, IsNumber, Min, Max, ValidateNested} from 'class-validator';
import { Type } from 'class-transformer';
import { BusinessStaffRole } from 'src/middleware/business-staff-role.enum';
import { StaffAddressDto, StaffEmergencyContactDto } from './StaffSubDtos';

export class CreateStaffDto {
  @IsString()
  @IsOptional()
  role?: BusinessStaffRole;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  phoneNumber: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  dob?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  jobTitle?: string;

  @IsString()
  @IsOptional()
  employmentType?: 'full-time' | 'part-time' | 'contract';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffAddressDto)
  addresses: StaffAddressDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StaffEmergencyContactDto)
  emergencyContacts?: StaffEmergencyContactDto[];

  @IsObject()
  settings: any;

  @IsArray()
  @IsOptional()
  selectedServices?: string[];

  @IsArray()
  @IsOptional()
  servicesAssigned:string[]

  @IsString()
  @IsOptional()
  selectedLocation?: string;

  // Informational only — no staff wallet/payout exists yet. Recorded per
  // completed booking as a StaffCommissionEarning row the merchant can see;
  // does not move any money. Percentage, 0-100.
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  commissionRate?: number;
}