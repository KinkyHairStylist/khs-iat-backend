import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteServiceDto {
  @ApiProperty({
    description: 'Service ID to delete',
    example: 'uuid-here'
  })
  @IsUUID()
  serviceId: string;
}