import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// The card details themselves are never sent here — the customer enters
// them directly into Paystack's popup (see the frontend), which returns a
// `reference` for a tiny, immediately-refunded verification charge. This
// endpoint exchanges that reference for a reusable card token.
export class CreateCardDto {
  @ApiProperty({ example: 'a1b2c3d4e5' })
  @IsNotEmpty()
  @IsString()
  reference: string;
}
