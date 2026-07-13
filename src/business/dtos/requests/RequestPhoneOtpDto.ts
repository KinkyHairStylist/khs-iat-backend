import { IsNotEmpty, IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestPhoneOtpDto {
  @ApiProperty({
    description: 'Phone number to receive OTP',
    example: '+2348012345678'
  })
  @IsPhoneNumber()
  @IsNotEmpty()
  phone: string;
}
