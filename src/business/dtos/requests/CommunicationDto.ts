import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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
  @MaxLength(200)
  closingRemarks?: string;

  @IsString()
  @MinLength(1)
  clientName: string;

  @IsEmail()
  clientEmail: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
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
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  closingRemarks?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  messageSubject: string;

  @IsEnum(COMMUNICATION_MESSAGE_TYPE)
  messageType: COMMUNICATION_MESSAGE_TYPE;
}
