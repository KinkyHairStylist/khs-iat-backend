import {
  IsEmail,
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsEnum,
  IsNumber
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../middleware/role.enum';

/**
 * @description DTO for initiating signup or verification process.
 * Used when the user enters their email to receive a verification code.
 */
export class GetStartedDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    description: 'The email address of the user',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

/**
 * @description DTO for verifying a code sent to the user’s email during signup or login verification.
 */
export class VerifyCodeDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    description: 'The email address associated with the verification code',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: '12345',
    description: 'The verification code sent to the user’s email',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}

/**
 * @description DTO for resending a new verification code to a user’s email.
 */
export class ResendCodeDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    description: 'The email address of the user',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

/**
 * @description DTO for completing the signup process.
 * Requires user details such as name, password, and phone number.
 */
export class SignUpDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    description: 'The email address of the user',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'StrongPass123!',
    description: 'The password for the user account',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'Password must contain at least one lowercase letter, one uppercase letter, one numeric digit, and one special character, and must be at least 8 characters long.',
    },
  )
  password: string;

  @ApiProperty({
    example: 'Jane',
    description: 'The first name of the user',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'The surname of the user',
  })
  @IsString()
  @IsNotEmpty()
  surname: string;

  @ApiProperty({
    example: '+2348123456789',
    description: 'The phone number of the user, including the country code',
  })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({
    example: 'Female',
    description: 'Gender of the user (e.g. Male, Female, Other)',
  })
  @IsString()
  @IsNotEmpty()
  gender: string;

  @ApiProperty({
    example: 'REF123ABC',
    description:
      'Referral code used for registration (optional if user was invited)',
    required: false,
  })
  @IsString()
  @IsOptional()
  referralCode?: string;

  // 📍 Location fields
  @ApiProperty({
    example: 6.5244,
    description: 'User latitude (optional)',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({
    example: 3.3792,
    description: 'User longitude (optional)',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  longitude?: number;
}
/**
 * @description DTO for user login.
 */
export class CustomerLoginDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    description: 'The email address of the user',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'StrongPass123!',
    description: 'The user’s account password',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

/**
 * @description DTO for initiating a password reset (Step 1: Send reset code).
 */
export class ResetPasswordStartDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    description: 'The email address to send the reset code to',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

/**
 * @description DTO for verifying a password reset code (Step 2: Verify code).
 */
export class ResetPasswordVerifyDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    description: 'The email address associated with the reset code',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: '67890',
    description: 'The reset verification code sent to the user’s email',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}

/**
 * @description DTO for completing password reset (Step 3: Set new password).
 */
export class ResetPasswordFinishDto {
  @ApiProperty({
    example: 'jane.doe@example.com',
    description: 'The email address of the user resetting their password',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'NewPassword456!',
    description: 'The new password chosen by the user',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'Password must contain at least one lowercase letter, one uppercase letter, one numeric digit, and one special character, and must be at least 8 characters long.',
    },
  )
  newPassword: string;

  @ApiProperty({
    example: 'NewPassword456!',
    description: 'Confirmation of the new password (must match newPassword)',
  })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}

/**
 * @description Standardized response object for authentication and user-related endpoints.
 */
export class AuthResponseDto {
  @ApiProperty({
    example: 'Signup successful',
    description: 'Descriptive message of the operation result',
  })
  message: string;

  @ApiProperty({
    example: true,
    description: 'Indicates whether the operation was successful',
  })
  success: boolean;

  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImphbmUuZG9lQGV4YW1wbGUuY29tIiwiaWF0IjoxNzAxOTM1NTU1LCJleHAiOjE3MDE5MzY0NTV9.xxxxx',
    description: 'JWT token for authenticated sessions (optional)',
    required: false,
  })
  token?: string;

  @ApiProperty({
    description: 'JWT refresh token for authenticated sessions (optional)',
    required: false,
  })
  refreshToken?: string;

  @ApiProperty({
    description: 'User details returned with successful authentication',
    example: {
      id: '7e11c090-3bfa-11ef-947f-0242ac120002',
      email: 'jane.doe@example.com',
      firstName: 'Jane',
      surname: 'Doe',
      phoneNumber: '+2348123456789',
      gender: 'Female',
      isVerified: true,
    },
    required: false,
  })
  user?: {
    id: string;
    email: string;
    firstName?: string;
    surname?: string;
    phoneNumber?: string;
    gender?: string;
    isVerified: boolean;
  };
}
