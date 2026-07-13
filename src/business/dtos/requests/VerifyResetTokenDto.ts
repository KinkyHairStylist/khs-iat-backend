import {IsNotEmpty, IsString } from 'class-validator';

export class VerifyResetTokenDto {

  @IsString({ message: 'Token must be a string.' })
  @IsNotEmpty({ message: 'Reset token is required.' })
  readonly token: string;


}
