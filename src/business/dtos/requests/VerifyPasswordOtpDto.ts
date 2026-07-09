import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * DTO for verifying the OTP code sent to the user's email during the password reset flow.
 */
export class VerifyPasswordOtpDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty({ message: 'Email address is required.' })
  readonly email: string;

  @IsString({ message: 'OTP must be a string.' })
  @IsNotEmpty({ message: 'OTP code is required.' })

  readonly otp: string;
}
