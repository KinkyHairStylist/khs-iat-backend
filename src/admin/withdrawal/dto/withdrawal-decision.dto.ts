import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// KHS confirms it has sent the money. The reference is what the bank or transfer service showed,
// so the salon (and KHS) can trace the payment.
export class MarkWithdrawalPaidDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  reference: string;
}

// KHS refuses a request. The reason is shown to the salon.
export class RejectWithdrawalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
