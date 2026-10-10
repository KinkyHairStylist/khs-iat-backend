import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';
import { SystemAlertSeverity, SystemAlertAudience } from '../entities/system-alert.entity';

export class CreateAlertDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(SystemAlertSeverity)
  @IsOptional()
  severity?: SystemAlertSeverity;

  @IsEnum(SystemAlertAudience)
  @IsOptional()
  audience?: SystemAlertAudience;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
