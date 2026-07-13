import { IsNumber, Min, IsNotEmpty } from 'class-validator';

export class CreateBookingPoliciesDto {
  @IsNumber({}, { message: 'Minimum lead time must be a number.' })
  @Min(0, { message: 'Minimum lead time cannot be negative.' })
  @IsNotEmpty()
  readonly minimumLeadTime: number; //minutes

  @IsNumber({}, { message: 'Buffer time must be a number.' })
  @Min(0, { message: 'Buffer time cannot be negative.' })
  @IsNotEmpty()
  readonly bufferTime: number; //minutes

  @IsNumber({}, { message: 'Cancellation window must be a number.' })
  @Min(0, { message: 'Cancellation window cannot be negative.' })
  @IsNotEmpty()
  readonly cancellationWindow: number; //hours

  @IsNumber({}, { message: 'Deposit amount must be a number.' })
  @Min(0, { message: 'Deposit amount cannot be negative.' })
  readonly depositAmount: number = 0;
}
