import { IsOptional, IsString, IsNumber, IsUUID } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class TransactionPaginationDto {
  @ApiPropertyOptional({
    description: 'Number of transactions per page',
    example: 50,
    default: 50,
  })
  @IsOptional()
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Cursor for pagination (use endCursor from previous response)',
    example: 'MjAyNC0wMS0xNVQxMDozMDowMC4wMDBafHRyYW5zYWN0aW9uLXV1aWQ=',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class GetTransactionSummaryDto {
  @ApiPropertyOptional({
    description: 'Year for transaction summary (defaults to current year)',
    example: 2025,
  })
  @IsOptional()
  @IsNumber()
  year?: number;
}

export class RequestRefundDto {
  @ApiProperty({
    description: 'ID of the transaction to request refund for',
    example: 'transaction-uuid-here',
  })
  @IsUUID()
  transactionId: string;

  @ApiProperty({
    description: 'Reason for the refund request',
    example: 'Service was not satisfactory',
  })
  @IsString()
  reason: string;

  // Account details for refund (optional - user may provide)
  @ApiPropertyOptional({
    description: 'Bank name for refund transfer',
    example: 'First Bank of Nigeria',
  })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({
    description: 'Account number for refund',
    example: '1234567890',
  })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Account holder full name',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @ApiPropertyOptional({
    description: 'Routing number or sort code',
    example: '044',
  })
  @IsOptional()
  @IsString()
  routingNumber?: string;

  @ApiPropertyOptional({
    description: 'Bank address',
    example: '123 Bank Street, Lagos, Nigeria',
  })
  @IsOptional()
  @IsString()
  bankAddress?: string;

  @ApiPropertyOptional({
    description: 'SWIFT/BIC code',
    example: 'FBNINGLA',
  })
  @IsOptional()
  @IsString()
  swiftCode?: string;
}
