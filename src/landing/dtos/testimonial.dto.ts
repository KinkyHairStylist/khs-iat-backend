import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsInt,
  Max,
  Min,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';

export class CreateTestimonialDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  role?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  avatar?: string;
}

export class UpdateTestimonialDto extends PartialType(CreateTestimonialDto) {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isApproved?: boolean;
}
