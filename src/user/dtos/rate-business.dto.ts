import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
