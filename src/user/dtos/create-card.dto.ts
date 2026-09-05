import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateCardDto {
  @ApiPropertyOptional({ example: 'a1b2c3d4e5' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: 'Visa' })
  @IsOptional()
  @IsString()
  providerName?: string;

  @ApiPropertyOptional({ example: 'credit' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  cardHolderName?: string;

  @ApiPropertyOptional({ example: '4242424242424242' })
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiPropertyOptional({ example: '12' })
  @IsOptional()
  @IsString()
  expiryMonth?: string;

  @ApiPropertyOptional({ example: '2028' })
  @IsOptional()
  @IsString()
  expiryYear?: string;

  @ApiPropertyOptional({ example: '123' })
  @IsOptional()
  @IsString()
  cvv?: string;

  @ApiPropertyOptional({ example: '123 Main St' })
  @IsOptional()
  @IsString()
  billingAddress?: string;
}
