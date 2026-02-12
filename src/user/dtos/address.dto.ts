import { IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAddressDto {
  @ApiProperty({
    description: 'Type of address',
    enum: ['Home', 'Work'],
    example: 'Home'
  })
  @IsEnum(['Home', 'Work'])
  @IsNotEmpty()
  type: string;

  @ApiProperty({
    description: 'Full address string',
    example: '12 Main Street, Legos, Nigeria'
  })
  @IsString()
  @IsNotEmpty()
  fullAddress: string;
}

export class UpdateAddressDto {
  @ApiProperty({
    description: 'Type of address (optional)',
    enum: ['Home', 'Work'],
    example: 'Work',
    required: false
  })
  @IsEnum(['Home', 'Work'])
  type?: string;

  @ApiProperty({
    description: 'Full address string (optional)',
    example: '405 Business District, Legos, Nigeria',
    required: false
  })
  @IsString()
  fullAddress?: string;
}
