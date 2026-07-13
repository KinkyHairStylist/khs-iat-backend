import { IsNotEmpty, IsPhoneNumber, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPhoneOtpDto {
  @ApiProperty({
    description: 'Phone number associated with the OTP',
    example: '+2348012345678'
  })
  @IsPhoneNumber()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({
    description: 'OTP code received via SMS',
    example: '1234',
    minLength: 4,
    maxLength: 6
  })
  @IsNotEmpty()
  @Length(4, 6)
  otp: string;
}
