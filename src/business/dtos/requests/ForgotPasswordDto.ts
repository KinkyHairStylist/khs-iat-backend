import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address to send password reset OTP',
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty({ message: 'Email address is required.' })
  readonly email: string;
}
