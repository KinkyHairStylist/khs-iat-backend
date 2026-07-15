import { IsString, IsNumber, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BusinessCategory } from '../../types/category.enum';
import { ServiceType } from '../../types/service-type.enum';
import { PriceType } from '../../types/price-type.enum';

export class CreateServiceDto {
    @ApiProperty({
      description: 'Name of the service',
      example: 'Women Haircut'
    })
    @IsString()
    name: string;

    @ApiProperty({
      description: 'User email (optional)',
      example: 'user@example.com',
      required: false
    })
    @IsString()
    @IsOptional()
    userMail: string;

    @ApiProperty({
      description: 'Service images',
      type: [String],
      required: false
    })
    @IsOptional()
    images: string[];

    @ApiProperty({
      description: 'Service category',
      enum: BusinessCategory,
      example: BusinessCategory.HAIR_SERVICES
    })
    @IsOptional()
    @IsEnum(BusinessCategory)
    category?: BusinessCategory;

    @ApiProperty({
      description: 'Service type',
      enum: ServiceType,
      example: ServiceType.WOMEN_HAIRCUT
    })
    @IsOptional()
    @IsEnum(ServiceType)
    serviceType?: ServiceType;

    @ApiProperty({
      description: 'Service description',
      example: 'Professional haircut for women',
      required: false
    })
    @IsString()
    @IsOptional()
    description: string;

    @ApiProperty({
      description: 'Price type: fixed or variable',
      enum: PriceType,
      example: PriceType.FIXED,
      required: false
    })
    @IsOptional()
    @IsEnum(PriceType)
    priceType?: PriceType;

    @ApiProperty({
      description: 'Service price (required for fixed pricing)',
      example: 50.00,
      required: false
    })
    @IsNumber()
    @IsOptional()
    price?: number;

    @ApiProperty({
      description: 'Minimum price (required for variable pricing)',
      example: 30.00,
      required: false
    })
    @IsNumber()
    @IsOptional()
    minPrice?: number;

    @ApiProperty({
      description: 'Maximum price (required for variable pricing)',
      example: 80.00,
      required: false
    })
    @IsNumber()
    @IsOptional()
    maxPrice?: number;

    @ApiProperty({
      description: 'Service duration',
      example: '60 minutes',
      required: false
    })
    @IsString()
    @IsOptional()
    duration: string;

    @ApiProperty({
      description: 'Advertisement plan ID (optional)',
      example: 'uuid-here',
      required: false
    })
    @IsOptional()
    @IsUUID()
    advertisementPlanId?: string;

    @ApiProperty({
      description: 'Business ID (optional)',
      example: 'uuid-here',
      required: false
    })
    @IsOptional()
    @IsUUID()
    businessId?: string;

    @ApiProperty({
      description: 'Assigned staff ID (optional)',
      example: 'uuid-here',
      required: false
    })
    @IsOptional()
    @IsUUID()
    assignedStaffId?: string;
}
