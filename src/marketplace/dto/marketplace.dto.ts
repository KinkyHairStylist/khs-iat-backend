import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  Min,
  Max,
  IsUUID,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  MinLength,
} from 'class-validator';
import { ProductCategory, ShippingStatus } from '../enum/marketplace.enum';
import { WalletCurrency } from 'src/admin/payment/enums/wallet.enum';

export class CreateProductDto {
  @IsString()
  productName: string;

  @IsString()
  description: string;

  @IsUUID()
  ownerId: string;

  @IsString()
  @MinLength(1)
  currency: WalletCurrency.AUD;

  @IsNumber()
  @Min(1)
  sellingPrice: number;

  @IsNumber()
  @Min(1)
  costPrice: number;

  @IsNumber()
  @Min(1)
  stockQuantity: number;

  @IsString()
  category: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsOptional()
  @IsEnum(ShippingStatus)
  shippingStatus?: ShippingStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  shippingProgress?: number;

  @IsOptional()
  @IsString()
  productImage?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsEnum(ShippingStatus)
  shippingStatus?: ShippingStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  shippingProgress?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  productImage?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  isActive?: boolean;
}

export class UpdateCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  categories: string[];
}

export class AddCategoryDto {
  @IsString()
  @IsNotEmpty()
  category: string;
}

export class ProductFiltersDto {
  @IsOptional()
  search?: string;

  @IsOptional()
  category?: string;

  @IsOptional()
  status?: string;

  @IsOptional()
  sellingPrice?: string;

  @IsOptional()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}
