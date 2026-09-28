import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

// Matches src/business/entities/address.entity.ts exactly: name and
// location are NOT NULL columns there, so a malformed request that skips
// either was reaching the database and coming back as a bare, unhelpful
// 500 (a Postgres not-null violation) instead of a proper 400.
export class StaffAddressDto {
  @IsString()
  name: string;

  @IsString()
  location: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

// Matches src/business/entities/emergency-contact.entity.ts — only
// firstName is NOT NULL there, everything else is nullable.
export class StaffEmergencyContactDto {
  @IsString()
  firstName: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  relationship?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;
}
