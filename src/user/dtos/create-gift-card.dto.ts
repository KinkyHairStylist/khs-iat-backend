import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, IsEmail } from 'class-validator';

export class PurchaseBusinessGiftCardDto {
  @ApiProperty({
    description: 'Code of the gift card to purchase',
    example: 'KyGThyg789',
  })
  @IsString()
  @IsNotEmpty()
  businessGiftCardId: string;

  @ApiProperty({
    description: 'User card ID used to make the purchase',
    example: 'b5a4b2a0-1a9c-4c2f-b3a4-73a1b5ad5f87',
  })
  @IsUUID()
  @IsOptional()
  cardId: string;

  @ApiProperty({
    description: 'Name of the gift card recipient',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  recipientName: string;

  @ApiProperty({
    description: 'Email of the gift card recipient',
    example: 'john@example.com',
  })
  @IsOptional()
  @IsEmail()
  recipientEmail: string;

  @ApiPropertyOptional({
    description: 'Optional personalized message for the recipient',
    example: 'Happy Birthday 🎉',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Card owner fullname from the user body ',
    example: 'John Don',
  })
  @IsOptional()
  @IsString()
  fullName?: string;
}

export class RedeemGiftCardDto {
  @ApiProperty({ example: '8G3X92DKQ1' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class ValidateGiftCardDto {
  @ApiProperty({ example: '8G3X92DKQ1' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
