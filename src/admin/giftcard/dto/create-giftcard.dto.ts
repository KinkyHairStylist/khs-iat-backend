import { IsNotEmpty, IsString, IsEmail, IsNumber, IsDateString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefundGiftCardDto {
  @ApiProperty({
    description: 'Reason for refunding the gift card',
    example: 'Customer requested refund due to mistaken purchase',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;
}