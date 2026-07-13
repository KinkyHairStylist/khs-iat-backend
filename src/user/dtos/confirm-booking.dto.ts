import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ConfirmBookingDto {
  @ApiProperty({
    example: 'BKID-1234567',
    description: 'The order ID of the booking to confirm',
  })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({
    example: true,
    description: 'Whether to pay at the venue',
  })
  @IsBoolean()
  payAtVenue: boolean;

  @ApiProperty({
    example: 'card-123',
    description: 'The card ID for payment (optional)',
  })
  @IsString()
  @IsOptional()
  cardId?: string;

  @ApiProperty({
    example: 'gift-456',
    description: 'The gift card for payment (optional)',
  })
  @IsString()
  @IsOptional()
  giftCard?: string;
}
