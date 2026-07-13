import {
  IsBoolean,
  IsNumber,
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  IsEmail,
  Min,
  Max,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from 'src/business/types/constants';

export class ReminderRuleDto {
  @IsString()
  messageType: string;

  @IsNumber()
  @Min(1)
  @Max(168)
  reminderHoursBeforeAppointment: number;

  @IsString()
  reminderMessage: string;
}

export class BusinessNotificationsDto {
  @IsBoolean()
  @IsOptional()
  newBookingAlerts?: boolean;

  @IsBoolean()
  @IsOptional()
  cancellationAlerts?: boolean;

  @IsBoolean()
  @IsOptional()
  dailySummaryReports?: boolean;
}

export class NotificationSettingsDto {
  @IsBoolean()
  @IsOptional()
  enableAutomatedReminders?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderRuleDto)
  @IsOptional()
  reminderRules?: ReminderRuleDto[];

  @ValidateNested()
  @Type(() => BusinessNotificationsDto)
  @IsOptional()
  businessNotifications?: BusinessNotificationsDto;
}

export class BookingRulesDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumLeadTimeHours?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  bufferTimeBetweenAppointmentsMinutes?: number;

  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  maximumAdvanceBookingDays?: number;

  @IsString()
  @IsOptional()
  sameDayBookingCutoff?: string;

  @IsBoolean()
  @IsOptional()
  enableWaitlist?: boolean;

  @IsBoolean()
  @IsOptional()
  autoNotifyWaitlist?: boolean;

  @IsBoolean()
  @IsOptional()
  allowDoubleBookings?: boolean;
}

export class ClientManagementDto {
  @IsNumber()
  @Min(1)
  @IsOptional()
  noShowLimit?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  restrictionPeriodDays?: number;

  @IsBoolean()
  @IsOptional()
  requirePhoneVerification?: boolean;

  @IsBoolean()
  @IsOptional()
  allowGuestBooking?: boolean;

  @IsBoolean()
  @IsOptional()
  collectClientFeedback?: boolean;

  @IsBoolean()
  @IsOptional()
  weeklyNoShowReports?: boolean;

  @IsBoolean()
  @IsOptional()
  clientNoShowPattern?: boolean;

  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  reportRecipients?: string[];
}

export class OnlinePresenceDto {
  @IsBoolean()
  @IsOptional()
  enableOnlineBooking?: boolean;

  @IsString()
  @IsOptional()
  bookingPageUrl?: string;

  @IsString()
  @IsOptional()
  websiteEmbedCode?: string;

  @IsString()
  @IsOptional()
  seoBusinessDescription?: string;

  @IsString()
  @IsOptional()
  seoPrimaryColor?: string;

  @IsString()
  @IsOptional()
  seoAccentColor?: string;
}

export class PricingPoliciesDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  cancellationWindow?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  cancellationFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  noShowFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  depositPercentageRequired?: number;

  @IsBoolean()
  @IsOptional()
  depositRequired?: boolean;

  @IsBoolean()
  @IsOptional()
  acceptCardPayment?: boolean;

  @IsBoolean()
  @IsOptional()
  acceptCashPayment?: boolean;

  @IsString()
  @IsOptional()
  cancellationPolicyText?: string;

  @IsString()
  @IsOptional()
  noShowFeeType?: string;

  @IsString()
  @IsOptional()
  cancellationFeeType?: string;
}

export class IntegrationsDto {
  @IsBoolean()
  @IsOptional()
  googleCalendar?: boolean;

  @IsBoolean()
  @IsOptional()
  mailChimp?: boolean;

  @IsBoolean()
  @IsOptional()
  zohoBooks?: boolean;
}

export class CreateBusinessOwnerSettingsDto {
  @IsString()
  businessId: string;

  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  @IsOptional()
  notifications?: NotificationSettingsDto;

  @ValidateNested()
  @Type(() => BookingRulesDto)
  @IsOptional()
  bookingRules?: BookingRulesDto;

  @ValidateNested()
  @Type(() => ClientManagementDto)
  @IsOptional()
  clientManagement?: ClientManagementDto;
}

export class UpdateBusinessOwnerSettingsDto {
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  @IsOptional()
  notifications?: NotificationSettingsDto;

  @ValidateNested()
  @Type(() => BookingRulesDto)
  @IsOptional()
  bookingRules?: BookingRulesDto;

  @ValidateNested()
  @Type(() => ClientManagementDto)
  @IsOptional()
  clientManagement?: ClientManagementDto;

  @ValidateNested()
  @Type(() => OnlinePresenceDto)
  @IsOptional()
  onlinePresence?: OnlinePresenceDto;

  @ValidateNested()
  @Type(() => PricingPoliciesDto)
  @IsOptional()
  pricingPolicies?: PricingPoliciesDto;

  @ValidateNested()
  @Type(() => IntegrationsDto)
  @IsOptional()
  integrations?: IntegrationsDto;

  @IsString()
  @IsOptional()
  apiKey?: string;
}

export class UpdateOwnerProfileDto {
  @IsString()
  firstName: string;

  @IsString()
  surname: string;

  @IsString()
  phoneNumber: string;

  @IsDate()
  dateOfBirth: Date;

  @IsString()
  gender: Gender;

  @IsString()
  @IsOptional()
  profilePicture?: string;
}

class AddressDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  fullAddress?: string;
}

export class UpdateUserAddressDto {
  @Type(() => AddressDto)
  address: AddressDto;
}

class CreateAddressDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsString()
  fullAddress: string;
}

export class CreateUserAddressDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAddressDto)
  addresses: CreateAddressDto[];
}
