import { IsUUID, IsArray, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignStaffToBookingDto {
  @ApiProperty({
    description: 'Booking (appointment) ID to assign staff to',
    example: 'uuid-here',
  })
  @IsUUID()
  @IsNotEmpty()
  appointmentId: string;

  @ApiProperty({
    description: 'Array of staff IDs to assign to the booking',
    type: [String],
    example: ['staff-uuid-1', 'staff-uuid-2'],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsNotEmpty()
  staffIds: string[];
}
