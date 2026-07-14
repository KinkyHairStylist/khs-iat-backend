import { IsString, IsNumber, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BusinessCategory } from '../types/category.enum';
import { ServiceType } from '../types/service-type.enum';
import { PriceType } from '../types/price-type.enum';

export class UpdateServiceDto {
  @ApiProperty({
    description: 'Name of the service (optional)',
    example: 'Women Haircut',
    required: false
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Service category (optional)',
    enum: BusinessCategory,
    required: false
  })
  @IsOptional()
  @IsEnum(BusinessCategory)
  category?: BusinessCategory;

  @ApiProperty({
    description: 'Service type (optional)',
    enum: ServiceType,
    required: false
  })
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  @ApiProperty({
    description: 'Service description (optional)',
    example: 'Professional haircut for women',
    required: false
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Price type: fixed or variable',
    enum: PriceType,
    required: false
  })
  @IsOptional()
  @IsEnum(PriceType)
  priceType?: PriceType;

  @ApiProperty({
    description: 'Service price (for fixed pricing)',
    example: 50.00,
    required: false
  })
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiProperty({
    description: 'Minimum price (for variable pricing)',
    example: 30.00,
    required: false
  })
  @IsNumber()
  @IsOptional()
  minPrice?: number;

  @ApiProperty({
    description: 'Maximum price (for variable pricing)',
    example: 80.00,
    required: false
  })
  @IsNumber()
  @IsOptional()
  maxPrice?: number;

  @ApiProperty({
    description: 'Service duration (optional)',
    example: '60 minutes',
    required: false
  })
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiProperty({
    description: 'Service images (optional)',
    type: [String],
    required: false
  })
  @IsOptional()
  images?: string[];

  @ApiProperty({
    description: 'Advertisement plan ID (optional)',
    example: 'uuid-here',
    required: false
  })
  @IsOptional()
  @IsUUID()
  advertisementPlanId?: string;

  @ApiProperty({
    description: 'Assigned staff ID (optional)',
    example: 'uuid-here',
    required: false
  })
  @IsOptional()
  @IsUUID()
  assignedStaffId?: string;
}