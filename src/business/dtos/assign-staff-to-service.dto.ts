import { IsUUID, IsArray, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignStaffToServiceDto {
  @ApiProperty({
    description: 'Service ID to assign staff to',
    example: 'uuid-here'
  })
  @IsUUID()
  @IsNotEmpty()
  serviceId: string;

  @ApiProperty({
    description: 'Array of staff IDs to assign to the service',
    type: [String],
    example: ['staff-uuid-1', 'staff-uuid-2']
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsNotEmpty()
  staffIds: string[];
}