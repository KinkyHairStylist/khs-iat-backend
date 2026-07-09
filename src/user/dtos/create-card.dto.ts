import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateCardDto {
  @ApiProperty({ example: 'Visa' })
  @IsNotEmpty()
  @IsString()
  providerName: string;

  @ApiProperty({ example: 'credit' })
  @IsNotEmpty()
  @IsString()
  type: string;

  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  cardHolderName: string;

  @ApiProperty({ example: '4242424242424242' })
  @IsNotEmpty()
  @IsString()
  cardNumber: string;

  @ApiProperty({ example: '12' })
  @IsNotEmpty()
  @IsString()
  expiryMonth: string;

  @ApiProperty({ example: '2028' })
  @IsNotEmpty()
  @IsString()
  expiryYear: string;

  @ApiProperty({ example: '123', required: false })
  @IsOptional()
  @IsString()
  cvv?: string;

  @ApiProperty({ example: '123 Street, NY', required: false })
  @IsOptional()
  @IsString()
  billingAddress?: string;
}
