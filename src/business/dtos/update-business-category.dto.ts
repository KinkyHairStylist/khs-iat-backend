import { IsArray, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BusinessCategory } from '../types/category.enum';

export class UpdateBusinessCategoryDto {
  @ApiProperty({
    description: 'Array of business categories',
    enum: BusinessCategory,
    isArray: true,
    example: ['hair-services', 'nail-services'],
    enumName: 'BusinessCategory'
  })
  @IsArray()
  @IsEnum(BusinessCategory, { each: true })
  @IsNotEmpty()
  categories: BusinessCategory[];
}