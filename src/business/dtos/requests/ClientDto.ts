import {
  IsEmail,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsString,
  MinLength,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClientSource, Pronouns, ClientType } from 'src/business/entities/client.entity';
import {
  Languages,
  PreferredContactMethod,
  Timezone,
} from 'src/business/entities/client-settings.entity';
import { Gender } from 'src/business/types/constants';

export class CreateClientProfileDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsString()
  @MinLength(1)
  phoneCode: string;

  @IsOptional()
  dateOfBirth?: Date | string;

  @IsEnum(Gender)
  gender: Gender;

  @IsEnum(ClientType)
  clientType: ClientType;

  @IsOptional()
  @IsEnum(Pronouns)
  pronouns: Pronouns;

  @IsOptional()
  occupation?: string;

  @IsEnum(ClientSource)
  clientSource: ClientSource;

  // @IsOptional()
  // profileImage?: any;
}

export class CreateClientAddressDto {
  @IsString()
  @MinLength(1)
  addressName: string;

  @IsString()
  @MinLength(1)
  addressLine1: string;

  @IsOptional()
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  location: string;

  @IsOptional()
  city?: string;

  @IsOptional()
  state?: string;

  @IsOptional()
  zipCode?: string;

  @IsOptional()
  country?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsOptional()
  clientId?: string;
}

export class CreateEmergencyContactDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsOptional()
  lastName?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  relationship: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsString()
  @MinLength(1)
  emergencyPhoneCode: string;

  @IsOptional()
  clientId?: string;
}

export class CreateClientSettingsDto {
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  smsNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  marketingEmails?: boolean;

  @IsEnum(ClientType)
  @IsOptional()
  clientType?: ClientType;

  @IsOptional()
  notes?: string;

  @IsOptional()
  clientId?: string;

  preferences: {
    preferredContactMethod: PreferredContactMethod;
    language: Languages;
    timezone: Timezone;
  };
}

export class CreateClientDto {
  @ValidateNested()
  @Type(() => CreateClientProfileDto)
  profile: CreateClientProfileDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateClientAddressDto)
  @IsOptional()
  addresses?: CreateClientAddressDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEmergencyContactDto)
  @IsOptional()
  emergencyContacts?: CreateEmergencyContactDto[];

  @ValidateNested()
  @Type(() => CreateClientSettingsDto)
  settings: CreateClientSettingsDto;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName: string;

  @IsOptional()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phone: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phoneCode: string;

  @IsOptional()
  dateOfBirth?: Date | string;

  @IsOptional()
  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsEnum(ClientType)
  clientType: ClientType;

  @IsOptional()
  @IsOptional()
  @IsEnum(Pronouns)
  pronouns: Pronouns;

  @IsOptional()
  @IsOptional()
  occupation?: string;

  @IsOptional()
  @IsEnum(ClientSource)
  clientSource: ClientSource;

  @IsOptional()
  profilePicture?: string;
}

export class UpdateEmergencyContactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  id: string;

  @IsString()
  @MinLength(1)
  firstName: string;

  @IsOptional()
  lastName?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  relationship: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsString()
  @MinLength(1)
  emergencyPhoneCode: string;

  @IsOptional()
  clientId?: string;
}

export class UpdateClientAddressDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  id: string;

  @IsString()
  @MinLength(1)
  addressName: string;

  @IsString()
  @MinLength(1)
  addressLine1: string;

  @IsOptional()
  addressLine2: string | null;

  @IsString()
  @MinLength(1)
  location: string;

  @IsOptional()
  city: string | null;

  @IsOptional()
  state?: string;

  @IsOptional()
  zipCode?: string;

  @IsOptional()
  country?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsOptional()
  clientId?: string;
}

export class ClientFiltersDto {
  @IsOptional()
  search?: string;

  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;

  @IsOptional()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class UpdateClientSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  id: string;

  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  smsNotifications?: boolean;

  @IsBoolean()
  @IsOptional()
  marketingEmails?: boolean;

  @IsEnum(ClientType)
  @IsOptional()
  clientType?: ClientType;

  @IsOptional()
  notes?: string;

  @IsOptional()
  clientId?: string;

  @IsOptional() // <--- mark preferences optional
  preferences?: Partial<{
    preferredContactMethod: PreferredContactMethod;
    language: Languages;
    timezone: Timezone;
  }>;
}
