import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// The card number/CVV never reach this backend at all — the customer enters
// them directly into Paystack's own Inline popup, which runs a small
// verification charge and returns this transaction reference. We exchange
// it for a reusable authorization code (see CardService.createCard).
export class CreateCardDto {
  @ApiProperty({ example: 'a1b2c3d4e5' })
  @IsNotEmpty()
  @IsString()
  reference: string;
}
