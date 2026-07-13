import { IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateWithdrawalDto {
  @IsString()
  businessName: string;

  @IsString()
  paymentMethodId: string;

  @IsNumber()
  amount: number;

  @IsNumber()
  currentBalance: number;
}
