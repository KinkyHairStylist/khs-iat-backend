import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token received via email',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  @IsString({ message: 'Token must be a string.' })
  @IsNotEmpty({ message: 'Reset token is required' })
  readonly token: string;

  @ApiProperty({
    description: 'New password (must include uppercase, lowercase, number, and symbol)',
    example: 'NewPassword123!'
  })
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'Password too weak: must include uppercase, lowercase, number, and symbol.',
    },
  )
  readonly newPassword: string;
}
