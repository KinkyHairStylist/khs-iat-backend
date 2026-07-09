import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '../../types/constants';

export class CreateUserDto {
  @ApiProperty({
    description: 'Email address of the user',
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @IsNotEmpty({ message: 'Email is required.' })
  readonly email: string;

  @ApiProperty({
    description: 'First name of the user',
    example: 'John'
  })
  @IsString()
  @IsNotEmpty({ message: 'First name is required.' })
  readonly firstName: string;

  @ApiProperty({
    description: 'Surname of the user',
    example: 'Doe'
  })
  @IsString()
  @IsNotEmpty({ message: 'Surname is required.' })
  readonly surname: string;

  @ApiProperty({
    description: 'Password for the account (minimum 8 characters)',
    example: 'Password123!'
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @IsNotEmpty({ message: 'Password is required.' })
  readonly password: string;

  @ApiProperty({
    description: 'Phone number of the user',
    example: '+2348012345678'
  })
  @IsNotEmpty({ message: 'Phone number is required.' })
  readonly phoneNumber: string;

  @ApiProperty({
    description: 'Gender of the user',
    enum: Gender,
    example: 'MALE'
  })
  @IsEnum(Gender, {
      message: 'Gender must be one of the following: MALE, FEMALE, CUSTOM.',
    })
  @IsNotEmpty({ message: 'Gender is required.' })
  gender: string;

  @ApiProperty({
    description: 'Verification token for email verification',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  @IsString({ message: 'Verification token must be a string.' })
  @IsNotEmpty({
    message: 'Verification token is required to complete registration.',
  })
  readonly verificationToken: string;
}
