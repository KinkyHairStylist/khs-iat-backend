import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Email address associated with the OTP',
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @IsNotEmpty({ message: 'Email is required.' })
  readonly email: string;

  @ApiProperty({
    description: 'OTP code received via email',
    example: '123456'
  })
  @IsString({ message: 'OTP must be a string.' })
  @IsNotEmpty({ message: 'OTP is required.' })
  readonly otp: string;
}
