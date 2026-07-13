import { IsString, MinLength, IsOptional } from 'class-validator';

export class ReviewResponseDto {
  @IsOptional()
  @IsString()
  businessId?: string;

  @IsString()
  @MinLength(1)
  reply: string;
}
