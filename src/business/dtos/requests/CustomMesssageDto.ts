import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export enum MESSAGE_TYPE {
  EMAIL = 'email',
  SMS = 'sms',
  EMAIL_SMS = 'email_sms',
}

export class SendCustomMessageDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsString()
  closingRemarks?: string;

  @IsString()
  @MinLength(1)
  clientName: string;

  @IsString()
  @MinLength(1)
  clientPhone: string;

  @IsEmail()
  clientEmail: string;

  @IsString()
  @MinLength(1)
  message: string;

  @IsString()
  @MinLength(1)
  messageSubject: string;

  @IsEnum(MESSAGE_TYPE)
  messageType: MESSAGE_TYPE;
}
