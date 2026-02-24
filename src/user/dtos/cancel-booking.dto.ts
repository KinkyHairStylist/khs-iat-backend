import { IsOptional, IsString, IsBoolean, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelBookingDto {
  @ApiProperty({
    description: 'Optional note explaining the reason for cancellation',
    example: 'Unable to attend due to unforeseen circumstances',
    required: false,
  })
  @IsOptional()
  @IsString()
  cancellationsNote?: string;

  @ApiProperty({
    description: 'Confirmation that user accepts cancellation terms',
    example: true,
  })
  @IsBoolean()
  acceptedTerms: boolean;

  @ApiProperty({
    description: 'List of service IDs to cancel. If not provided, all services in the booking will be cancelled.',
    example: ['uuid-service-1', 'uuid-service-2'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}
