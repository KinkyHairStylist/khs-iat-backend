import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsArray,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsEnum,
  Matches,
  IsUUID,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateBusinessNameDto {
  @ApiProperty({
    description: 'Business name',
    example: 'My Awesome Business',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  businessName?: string;

  @ApiProperty({
    description: 'Business description',
    example: 'We provide excellent services...',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description?: string;
}

export class UpdateBusinessContactDto {
  @ApiProperty({
    description: 'Owner name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  ownerName?: string;

  @ApiProperty({
    description: 'Owner email address',
    example: 'john.doe@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @ApiProperty({
    description: 'Owner phone number',
    example: '+1234567890',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  ownerPhone?: string;
}

export class UpdateBusinessLocationDto {
  @ApiProperty({
    description: 'Business address',
    example: '123 Main St, City, State 12345',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  businessAddress?: string;

  @ApiProperty({
    description: 'Latitude coordinate',
    example: 40.7128,
    minimum: -90,
    maximum: 90,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiProperty({
    description: 'Longitude coordinate',
    example: -74.006,
    minimum: -180,
    maximum: 180,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class UpdateBusinessProfileDto {
  // Basic Information
  @ApiProperty({
    description: 'Business name',
    example: 'My Awesome Business',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  businessName?: string;

  @ApiProperty({
    description: 'Business description',
    example: 'We provide excellent services...',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description: 'Business category',
    example: 'Restaurant',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  category?: string;

  @ApiProperty({
    description: 'Primary audience',
    example: 'Young professionals',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  primaryAudience?: string;

  // Contact Information
  @ApiProperty({
    description: 'Owner name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  ownerName?: string;

  @ApiProperty({
    description: 'Owner email address',
    example: 'john.doe@example.com',
    required: false,
  })
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @ApiProperty({
    description: 'Owner phone number',
    example: '+1234567890',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(20)
  ownerPhone?: string;

  // Location
  @ApiProperty({
    description: 'Business address',
    example: '123 Main St, City, State 12345',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  businessAddress?: string;

  @ApiProperty({
    description: 'Latitude coordinate',
    example: 40.7128,
    minimum: -90,
    maximum: 90,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiProperty({
    description: 'Longitude coordinate',
    example: -74.006,
    minimum: -180,
    maximum: 180,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  // Services
  @ApiProperty({
    description: 'Array of service names',
    example: ['Haircut', 'Coloring', 'Styling'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];
}

enum DayOfWeek {
  Monday = 'Monday',
  Tuesday = 'Tuesday',
  Wednesday = 'Wednesday',
  Thursday = 'Thursday',
  Friday = 'Friday',
  Saturday = 'Saturday',
  Sunday = 'Sunday',
}

export class UpdateBookingDayDto {
  @ApiProperty({
    description: 'Day of the week',
    enum: DayOfWeek,
    example: 'Monday',
    required: false,
  })
  @IsOptional()
  @IsEnum(DayOfWeek)
  day?:
    | 'Monday'
    | 'Tuesday'
    | 'Wednesday'
    | 'Thursday'
    | 'Friday'
    | 'Saturday'
    | 'Sunday';

  @ApiProperty({
    description: 'Whether the business is open on this day',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @ApiProperty({
    description: 'Start time in HH:MM format (24-hour)',
    example: '09:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Start time must be in HH:MM format (24-hour)',
  })
  startTime?: string;

  @ApiProperty({
    description: 'End time in HH:MM format (24-hour)',
    example: '17:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'End time must be in HH:MM format (24-hour)',
  })
  endTime?: string;
}

export class BookingDayUpdateItem {
  @ApiProperty({
    description: 'ID of the booking day to update',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'Day of the week',
    enum: DayOfWeek,
    example: 'Monday',
    required: false,
  })
  @IsOptional()
  @IsEnum(DayOfWeek)
  day?:
    | 'Monday'
    | 'Tuesday'
    | 'Wednesday'
    | 'Thursday'
    | 'Friday'
    | 'Saturday'
    | 'Sunday';

  @ApiProperty({
    description: 'Whether the business is open on this day',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @ApiProperty({
    description: 'Start time in HH:MM format (24-hour)',
    example: '09:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Start time must be in HH:MM format (24-hour)',
  })
  startTime?: string;

  @ApiProperty({
    description: 'End time in HH:MM format (24-hour)',
    example: '17:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'End time must be in HH:MM format (24-hour)',
  })
  endTime?: string;
}

export class UpdateBookingDaysDto {
  @ApiProperty({
    description: 'Array of booking days to update',
    type: [BookingDayUpdateItem],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingDayUpdateItem)
  bookingDays: BookingDayUpdateItem[];
}
