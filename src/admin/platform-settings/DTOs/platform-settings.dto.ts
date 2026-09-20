import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateGeneralSettingsDto {
  @IsOptional() @IsString() platformName?: string;
  @IsOptional() @IsString() platformUrl?: string;
  @IsOptional() @IsString() platformDescription?: string;
  @IsOptional() @IsString() supportEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsBoolean() userRegistration?: boolean;
  @IsOptional() @IsBoolean() businessRegistration?: boolean;
  @IsOptional() @IsBoolean() maintenanceMode?: boolean;
}

export class UpdateNotificationSettingsDto {
  @IsOptional() email?: {
    newUserRegistration?: boolean;
    businessApplications?: boolean;
    paymentFailures?: boolean;
    systemAlerts?: boolean;
  };
  @IsOptional() push?: {
    supportTickets?: boolean;
    contentReports?: boolean;
  };
}

export class UpdatePaymentSettingsDto {
  @IsOptional() @IsNumber() platformFee?: number;
  @IsOptional() @IsNumber() minWithdrawal?: number;
  @IsOptional() methods?: {
    creditCard?: boolean;
    paypal?: boolean;
    bankTransfers?: boolean;
  };
  @IsOptional() payoutSchedule?: 'Weekly' | 'Bi-Weekly' | 'Monthly';
  @IsOptional() acquisitionFeeTiers?: {
    Starter?: number;
    Growth?: number;
    Pro?: number;
  };
  @IsOptional() @IsNumber() commissionRate?: number;
  @IsOptional() @IsNumber() stripePassthroughRate?: number;
  @IsOptional() @IsNumber() stripePassthroughFixedFee?: number;
  @IsOptional() @IsNumber() @Min(0) earlyCancellationFee?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) lateCancellationStylistShare?: number;
  @IsOptional() subscriptionPrices?: {
    Starter?: { priceId?: string; displayAmount?: number };
    Growth?: { priceId?: string; displayAmount?: number };
    Pro?: { priceId?: string; displayAmount?: number };
  };
}

export class UpdateFeaturesSettingsDto {
  @IsOptional() user?: {
    reviewsAndRatings?: boolean;
    giftCards?: boolean;
    loyaltyProgram?: boolean;
    referralSystem?: boolean;
  };
  @IsOptional() business?: {
    onlineBooking?: boolean;
    staffManagement?: boolean;
    inventoryManagement?: boolean;
  };
}

export class UpdateIntegrationsSettingsDto {
  @IsOptional() paymentGateways?: {
    stripe?: { enabled?: boolean; key?: string; description?: string };
    paypal?: { enabled?: boolean; key?: string; description?: string };
  };
  @IsOptional() communication?: {
    twilio?: { enabled?: boolean; key?: string; description?: string };
    sendgrid?: { enabled?: boolean; key?: string; description?: string };
  };
}
