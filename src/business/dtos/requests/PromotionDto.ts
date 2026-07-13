import {
  IsUUID,
  IsString,
  IsEmail,
  IsEnum,
  MinLength,
  IsOptional,
  IsNumber,
} from 'class-validator';

export enum DISCOUNT_TYPE {
  PERCENTAGE = '%',
  DOLLAR = '$',
}

export class SendPromotionDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsString()
  businessId?: string;

  @IsString()
  @MinLength(1)
  clientName: string;

  @IsEmail()
  clientEmail: string;

  @IsString()
  @MinLength(1)
  clientPhone: string;

  @IsString()
  @MinLength(1)
  description: string;

  @IsString()
  @MinLength(1)
  promotionTitle: string;

  @IsString()
  @MinLength(1)
  discount: string;

  @IsString()
  @MinLength(1)
  promotionCode: string;

  @IsString()
  expiryDate: string;

  @IsEnum(DISCOUNT_TYPE)
  discountType: DISCOUNT_TYPE;
}
