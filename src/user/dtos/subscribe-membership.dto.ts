import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubscribeMembershipDto {
  @ApiProperty({
    example: 'uuid-of-tier',
    description: 'The ID of the membership tier to subscribe to',
  })
  @IsUUID()
  @IsNotEmpty()
  tierId: string;

  @ApiPropertyOptional({
    description: 'User card ID used to make the payment',
    example: 'b5a4b2a0-1a9c-4c2f-b3a4-73a1b5ad5f87',
  })
  @IsUUID()
  @IsOptional()
  cardId?: string;

  @ApiPropertyOptional({
    description: 'Gift card code to redeem for payment',
    example: '8G3X92DKQ1',
  })
  @IsString()
  @IsOptional()
  giftCard?: string;
}
