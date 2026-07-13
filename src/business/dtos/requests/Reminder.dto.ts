import {
  IsUUID,
  IsString,
  IsEmail,
  IsEnum,
  MinLength,
  IsOptional,
} from 'class-validator';

export enum REMINDER_MODE {
  SMS = 'sms',
  EMAIL = 'email',
}

export enum REMINDER_TYPE {
  UPCOMING = 'upcoming',
  FOLLOW_UP = 'follow_up',
  CUSTOM = 'custom',
  APPOINTMENT = 'appointment',
}

export class SendReminderDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsString()
  @MinLength(1)
  clientName: string;

  @IsEmail()
  clientEmail: string;

  @IsString()
  @MinLength(1)
  clientPhone: string;

  @IsString()
  @MinLength(1)
  message: string;

  @IsString()
  date: string; // e.g. "2025-02-12"

  @IsString()
  time: string; // e.g. "14:00"

  @IsEnum(REMINDER_MODE)
  mode: REMINDER_MODE;

  @IsEnum(REMINDER_TYPE)
  reminderType: REMINDER_TYPE;
}
