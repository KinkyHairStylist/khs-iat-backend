import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { Gender } from 'src/business/types/constants';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'AdminPass123!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class AdminInviteDto {
  @ApiProperty({ example: 'newuser@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'ADMIN',
    enum: ['ADMIN', 'BUSINESS', 'CLIENT'],
  })
  @IsString()
  @IsNotEmpty()
  role: string;
}

export class AdminRegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  )
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  surname: string;

  @ApiProperty({ example: '+2348123456789' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiPropertyOptional({
      description: 'Gender of the user',
      enum: Gender,
      example: Gender.MALE,
    })
    @IsOptional()
    @IsEnum(Gender)
    gender?: Gender;
}

export class AdminForgotPasswordDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class AdminResetPasswordDto {
  @ApiProperty({ example: 'StrongP@ss123!' })
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  )
  password: string;
}
