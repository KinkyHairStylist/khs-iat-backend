import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsEnum,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompanySize } from '../../types/constants';
import { CreateBookingPoliciesDto } from './CreateBookingPoliciesDto';
import { CreateBookingDayDto } from './CreateBookingDayDto';

export class CreateBusinessDto {
  @IsString({ message: 'Business name must be a string.' })
  @IsNotEmpty({ message: 'Business name is required.' })
  readonly businessName: string;

  @IsString({ message: 'Description must be a string.' })
  @IsNotEmpty({ message: 'Description is required.' })
  readonly description: string;

  @IsString({ message: 'Primary audience must be a string.' })
  @IsNotEmpty({ message: 'Primary audience is required.' })
  readonly primaryAudience: string;

  @IsArray({ message: 'Services must be an array of strings.' })
  @IsString({ each: true, message: 'Each service must be a string.' })
  @IsOptional()
  readonly services: string[] = [];

  @IsString({ message: 'Business address must be a string.' })
  @IsNotEmpty({ message: 'Business address is required.' })
  readonly businessAddress: string;

  @IsOptional()
  @IsNotEmpty({ message: 'address is required.' })
  readonly longitude: number;

  @IsOptional()
  @IsNotEmpty({ message: 'address is required.' })
  readonly latitude: number;

  @ValidateNested()
  @Type(() => CreateBookingPoliciesDto)
  @IsNotEmpty({ message: 'Booking policies are required.' })
  readonly bookingPolicies: CreateBookingPoliciesDto;

  @IsEnum(CompanySize, { message: 'Invalid company size.' })
  @IsNotEmpty({ message: 'Company size is required.' })
  readonly companySize: CompanySize;

  @IsArray({ message: 'Booking hours must be an array of 7 days.' })
  @ArrayMinSize(7, {
    message: 'Booking hours must contain 7 days (Monday-Sunday).',
  })
  @ArrayMaxSize(7, { message: 'Booking hours must contain exactly 7 days.' })
  @ValidateNested({ each: true })
  @Type(() => CreateBookingDayDto)
  @IsNotEmpty({ message: 'Booking hours are required.' })
  readonly bookingHours: CreateBookingDayDto[];

  @IsNotEmpty({ message: 'How did you hear is required.' })
  readonly howDidYouHear: string[];
}
