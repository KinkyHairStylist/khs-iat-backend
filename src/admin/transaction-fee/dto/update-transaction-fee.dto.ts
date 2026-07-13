import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsNumberString, IsOptional, IsString } from 'class-validator';

export class UpdateTransactionFeeDto {
  @IsOptional()
  @IsNumberString()
  bookingPercent?: string;

  @IsOptional()
  @IsNumberString()
  bookingFixed?: string;

  @IsOptional()
  @IsNumberString()
  bookingMin?: string;

  @IsOptional()
  @IsNumberString()
  bookingMax?: string;

  @IsOptional()
  @IsNumberString()
  withdrawalPercent?: string;

  @IsOptional()
  @IsNumberString()
  withdrawalFixed?: string;

  @IsOptional()
  @IsNumberString()
  withdrawalMin?: string;

  @IsOptional()
  @IsNumberString()
  withdrawalMax?: string;

  @IsOptional()
  @IsNumberString()
  premiumDiscount?: string;

  @IsOptional()
  @IsNumberString()
  vipDiscount?: string;

  @IsOptional()
  @IsNumberString()
  newBizDiscount?: string;

  @IsOptional()
  @IsBoolean()
  volumeDiscounts?: boolean;

  @IsOptional()
  @IsBoolean()
  applyToRefunds?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
