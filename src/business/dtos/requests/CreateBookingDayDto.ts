import {
  IsString,
  IsIn,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

const VALID_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export class CreateBookingDayDto {
  @IsString({ message: 'Day must be a string.' })
  @IsIn(VALID_DAYS, { message: 'Day must be a valid day of the week.' })
  @IsNotEmpty()
  readonly day: (typeof VALID_DAYS)[number];

  @IsBoolean({ message: 'isOpen must be a boolean.' })
  @IsOptional()
  readonly isOpen: boolean = false;

  @IsString({ message: 'Start time must be a string (e.g., "09:00").' })
  @IsNotEmpty()
  readonly startTime: string = '09:00';

  @IsString({ message: 'End time must be a string (e.g., "17:00").' })
  @IsNotEmpty()
  readonly endTime: string = '17:00';
}
