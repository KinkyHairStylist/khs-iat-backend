import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RateBusinessDto {
  @ApiProperty({
    description: 'Rating value between 1 and 5',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({
    description: 'Comment for the rating',
    example: 'Excellent service!',
  })
  @IsNotEmpty()
  @IsString()
  comment: string;

  @ApiPropertyOptional({
    description:
      'Separate rating (1-5) for the staff member who performed the service, distinct from the overall service rating. Omitted when the booking had no assigned staff.',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  staffRating?: number;
}
