import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { SupportedLanguage } from 'src/user/user_entities/preferences.entity';

export class UpdateUserPreferencesDto {
  @ApiPropertyOptional({
    example: 'en',
    enum: ['en', 'es', 'fr'],
    description: 'Preferred language (English, Spanish, or French)',
  })
  @IsOptional()
  @IsIn([SupportedLanguage.ENGLISH, SupportedLanguage.SPANISH, SupportedLanguage.FRENCH])
  language?: SupportedLanguage;

  @ApiPropertyOptional({ example: 'Africa/Lagos', description: 'Preferred timezone (IANA format)' })
  @IsOptional()
  @IsString()
  timeZone?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Profile visibility (true = visible, false = hidden)',
  })
  @IsOptional()
  @IsBoolean()
  profileVisibility?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Enable or disable location services',
  })
  @IsOptional()
  @IsBoolean()
  locationServices?: boolean;
}
