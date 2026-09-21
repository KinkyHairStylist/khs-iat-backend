import { IsNotEmpty, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

// An admin creating a membership package for a salon, in place of the salon doing it.
// Same fields the salon fills in, plus which salon it is for.
export class AdminCreateMerchantMembershipDto {
  @IsUUID()
  @IsNotEmpty({ message: 'Choose a salon.' })
  businessId: string;

  @IsUUID()
  @IsNotEmpty({ message: 'Choose a service.' })
  serviceId: string;

  @IsNumber()
  @Min(0.01, { message: 'Price per session must be more than 0.' })
  pricePerSession: number;

  @IsNumber()
  @Min(1, { message: 'A package needs at least 1 session.' })
  sessionCount: number;

  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Expiry must be at least 1 day.' })
  expiryDays?: number;
}
