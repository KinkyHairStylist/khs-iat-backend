import { ApiProperty } from '@nestjs/swagger';
import { Service } from 'src/business/entities/service.entity';
import { BookingDay } from 'src/business/entities/booking-day.entity';
import { Business } from 'src/business/entities/business.entity';

export class BusinessResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  businessName: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  businessAddress: string;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty({ type: () => [Service] })
  services: Service[];

  @ApiProperty({ type: () => [BookingDay] })
  bookingHours: BookingDay[];

  @ApiProperty()
  performance: Business['performance'];
}
