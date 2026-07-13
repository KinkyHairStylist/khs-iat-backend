import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CustomerUpdateNotificationSettingsDto {
  // EMAIL
  @ApiPropertyOptional({ description: 'Receive booking confirmation emails', example: true })
  @IsOptional() @IsBoolean() emailBookingConfirmations?: boolean;

  @ApiPropertyOptional({ description: 'Receive appointment reminder emails', example: true })
  @IsOptional() @IsBoolean() emailAppointmentReminders?: boolean;

  @ApiPropertyOptional({ description: 'Receive marketing & promotion emails', example: false })
  @IsOptional() @IsBoolean() emailMarketingPromotions?: boolean;

  @ApiPropertyOptional({ description: 'Receive special offer emails', example: true })
  @IsOptional() @IsBoolean() emailSpecialOffers?: boolean;

  @ApiPropertyOptional({ description: 'Receive new salon alert emails', example: false })
  @IsOptional() @IsBoolean() emailNewSalonAlerts?: boolean;

  // SMS
  @ApiPropertyOptional({ description: 'Receive booking confirmation SMS', example: false })
  @IsOptional() @IsBoolean() smsBookingConfirmations?: boolean;

  @ApiPropertyOptional({ description: 'Receive appointment reminder SMS', example: true })
  @IsOptional() @IsBoolean() smsAppointmentReminders?: boolean;

  @ApiPropertyOptional({ description: 'Receive marketing & promotion SMS', example: false })
  @IsOptional() @IsBoolean() smsMarketingPromotions?: boolean;

  @ApiPropertyOptional({ description: 'Receive special offer SMS', example: false })
  @IsOptional() @IsBoolean() smsSpecialOffers?: boolean;

  @ApiPropertyOptional({ description: 'Receive new salon alert SMS', example: true })
  @IsOptional() @IsBoolean() smsNewSalonAlerts?: boolean;
}