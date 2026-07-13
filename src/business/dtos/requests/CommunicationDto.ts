import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeepPartial } from 'typeorm';

export enum COMMUNICATION_MESSAGE_TYPE {
  EMAIL = 'email',
}

export class SendDirectMessageDto {
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

  @IsEmail()
  clientEmail: string;

  @IsString()
  @MinLength(1)
  message: string;

  @IsString()
  @MinLength(1)
  messageSubject: string;

  @IsEnum(COMMUNICATION_MESSAGE_TYPE)
  messageType: COMMUNICATION_MESSAGE_TYPE;
}

export class RecipientDto {
  @IsUUID()
  clientId: string;

  @IsString()
  @MinLength(1)
  clientName: string;

  @IsEmail()
  clientEmail: string;
}

export class SendBulkMessageDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsString()
  closingRemarks?: string;

  @IsString()
  @MinLength(1)
  message: string;

  @IsString()
  @MinLength(1)
  messageSubject: string;

  @IsEnum(COMMUNICATION_MESSAGE_TYPE)
  messageType: COMMUNICATION_MESSAGE_TYPE;
}
