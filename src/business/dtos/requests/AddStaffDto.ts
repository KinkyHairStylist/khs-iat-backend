import {IsString, IsOptional, IsArray, IsEmail, IsObject} from 'class-validator';
import { BusinessStaffRole } from 'src/middleware/business-staff-role.enum';

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
  addresses:any;

  @IsArray()
  emergencyContacts?: any;

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
}