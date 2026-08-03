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
}
