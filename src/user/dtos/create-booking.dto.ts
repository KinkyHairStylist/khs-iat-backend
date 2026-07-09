import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsNotEmpty, IsNumber, IsString, IsUUID } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({
    example: 'bbf9f0a9-b83e-418b-8f8c-bb06f547b1f9',
    description: 'The ID of the salon',
  })
  @IsUUID()
  @IsNotEmpty()
  salonId: string;

  @ApiProperty({
    example: ["bbf9f0a9-b83e-418b-8f8c-bb06f547b1f9", "bbf9f0a9-b83e-418b-8f8c-bb06f547b1f9", "bbf9f0a9-b83e-418b-8f8c-bb06f547b1f9"],
    description: 'An array of service IDs',
  })
  @IsArray()
  @IsNotEmpty()
  serviceIds: number[];

  @ApiProperty({
    example: '2025-08-27',
    description: 'The date of the booking',
  })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({
    example: '10:00 AM',
    description: 'The time of the booking',
  })
  @IsString()
  @IsNotEmpty()
  time: string;

  @ApiProperty({
    example: 150.0,
    description: 'The total amount for the booking',
  })
  @IsNumber()
  @IsNotEmpty()
  totalAmount: number;
}
