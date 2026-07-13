import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class RefundPaymentDto {
  @ApiProperty({
    description: 'The unique ID of the transaction to refund',
    example: 'txn_1234567890',
  })
  @IsString()
  transactionId: string;

  @ApiProperty({
    description: 'The amount to refund',
    example: 5000,
  })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({
    description: 'Type of refund (e.g., partial, full)',
    example: 'partial',
  })
  @IsOptional()
  @IsString()
  refundType?: string;

  @ApiPropertyOptional({
    description: 'Reason for the refund',
    example: 'Customer requested refund due to service issue',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
