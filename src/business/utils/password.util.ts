import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordUtil {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async comparePassword(
    password: string,
    hashPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashPassword);
  }

  validatePasswordStrength(password: string): void {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }
    if (!hasUpperCase || !hasLowerCase) {
      throw new BadRequestException(
        'Password must contain both uppercase and lowercase letters',
      );
    }
    if (!hasNumbers) {
      throw new BadRequestException(
        'Password must contain at least one number',
      );
    }
    if (!hasSpecialChar) {
      throw new BadRequestException(
        'Password must contain at least one special character',
      );
    }
  }
}
