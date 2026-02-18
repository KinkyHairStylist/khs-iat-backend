import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import sgMail from '@sendgrid/mail';

import { User } from '../../all_user_entities/user.entity';
import {
  GetStartedDto,
  VerifyCodeDto,
  ResendCodeDto,
  SignUpDto,
  CustomerLoginDto,
  ResetPasswordStartDto,
  ResetPasswordVerifyDto,
  ResetPasswordFinishDto,
  AuthResponseDto,
} from '../dtos/user.dto';
import { PasswordHashingHelper } from '../../helpers/password-hashing.helper';
import { getTokens } from '../../helpers/token.helper';
import { Referral } from '../user_entities/referrals.entity';
import { Gender } from 'src/business/types/constants';
import { ReferralService } from './referral.service';
import { PasswordUtil } from 'src/business/utils/password.util';

type SanitizedUser = Omit<
  User,
  | 'password'
  | 'verificationCode'
  | 'verificationExpires'
  | 'resetCode'
  | 'resetCodeExpires'
  | 'hasAdminRole'
  | 'hasBusinessAccess'
>;

@Injectable()
export class UserService {
  private fromEmail: string;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Referral)
    private referralRepository: Repository<Referral>,

    private jwtService: JwtService,
    private readonly referralService: ReferralService,
    private readonly passwordUtil: PasswordUtil,
  ) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      throw new Error('SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set');
    }

    sgMail.setApiKey(apiKey);
    this.fromEmail = fromEmail;
  }

  private generateCode(): string {
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  private async sendVerificationEmail(
    email: string,
    code: string,
  ): Promise<void> {
    const msg = {
      to: email,
      from: this.fromEmail,
      subject: 'Your KHS Email Verification Code',
      text: `Your verification code is: ${code}. It is valid for 10 minutes.`,
    };
    await sgMail.send(msg);
  }

  private async sendResetCodeEmail(email: string, code: string): Promise<void> {
    const msg = {
      to: email,
      from: this.fromEmail,
      subject: 'Password Reset Code',
      text: `Your password reset code is: ${code}. It is valid for 10 minutes.`,
    };
    await sgMail.send(msg);
  }

  async getStarted(dto: GetStartedDto): Promise<AuthResponseDto> {
    const { email } = dto;

    let user = await this.userRepository.findOne({ where: { email } });

    // user exists and is fully registered
    if (user && user.isVerified && user.password) {
      return {
        message: 'User already exists. Please log in instead.',
        success: false,
      };
    }

    const verificationCode = this.generateCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000);

    // user exists but not verified → update record
    if (user && !user.isVerified) {
      user.verificationCode = verificationCode;
      user.verificationExpires = verificationExpires;

      await this.userRepository.save(user);
      await this.sendVerificationEmail(user.email, verificationCode);

      return {
        message: 'Verification code resent to your email.',
        success: true,
      };
    }

    // new user → create a new record
    const newUser = this.userRepository.create({
      email,
      isVerified: false,
      verificationCode,
      verificationExpires,
    });

    await this.userRepository.save(newUser);
    await this.sendVerificationEmail(newUser.email, verificationCode);

    return { message: 'Verification code sent', success: true };
  }

  async verifyCode(dto: VerifyCodeDto): Promise<AuthResponseDto> {
    const { email, code } = dto;

    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      return {
        message: 'Already verified',
        user: this.sanitizeUser(user),
        success: true,
      };
    }

    if (user.verificationCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (!user.verificationExpires || new Date() > user.verificationExpires) {
      throw new BadRequestException('Verification code expired');
    }

    user.isVerified = true;
    user.verificationCode = null;
    user.verificationExpires = null;
    await this.userRepository.save(user);

    return {
      message: 'Email verified successfully',
      user: this.sanitizeUser(user),
      success: true,
    };
  }

  async resendCode(dto: ResendCodeDto): Promise<AuthResponseDto> {
    const { email } = dto;

    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      return { message: 'Already verified', success: true };
    }

    user.verificationCode = this.generateCode();
    user.verificationExpires = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepository.save(user);

    await this.sendVerificationEmail(user.email, user.verificationCode);

    return { message: 'New verification code sent', success: true };
  }

  async signUp(dto: SignUpDto): Promise<AuthResponseDto> {
    const {
      email,
      password,
      firstName,
      surname,
      phoneNumber,
      gender,
      referralCode,
    } = dto;

    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new BadRequestException('User not found or not verified');
    }

    if (!user.isVerified) {
      throw new BadRequestException('Email not verified');
    }

    // Save user profile
    user.password = await PasswordHashingHelper.hashPassword(password);
    user.firstName = firstName;
    user.surname = surname;
    user.phoneNumber = phoneNumber;
    user.gender = gender as Gender;

    // Generate referral code for the new user
    user.referralCode = await this.referralService.ensureReferralCode(user.id);

    // isClient defaults to true, so no need to set it explicitly

    await this.userRepository.save(user);

    // If a referral code was used, complete the referral and reward the referrer
    if (referralCode) {
      await this.referralService.completeReferral(email, user.id);
    }

    const { accessToken, refreshToken } = await getTokens(
      this.jwtService,
      user.id,
      user.email
    );

    return {
      message: 'Signup successful',
      token: accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
      success: true,
    };
  }

  async login(dto: CustomerLoginDto): Promise<AuthResponseDto> {
    const { email, password } = dto;

    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isVerified) {
      throw new BadRequestException('Email not verified');
    }

    if (!user.password) {
      throw new UnauthorizedException('Account not fully set up');
    }

    const isMatch = await PasswordHashingHelper.comparePassword(
      password,
      user.password,
    );

    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { accessToken, refreshToken } = await getTokens(
      this.jwtService,
      user.id,
      user.email
    );

    return {
      message: 'Login successful',
      token: accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
      success: true,
    };
  }

  async startResetPassword(
    dto: ResetPasswordStartDto,
  ): Promise<AuthResponseDto> {
    const { email } = dto;

    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      return { message: 'If account exists, reset code sent', success: true };
    }

    const resetCode = this.generateCode();
    const resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.resetCode = resetCode;
    user.resetCodeExpires = resetCodeExpires;
    await this.userRepository.save(user);

    await this.sendResetCodeEmail(email, resetCode);

    return { message: 'Password reset code sent', success: true };
  }

  async verifyResetCode(dto: ResetPasswordVerifyDto): Promise<AuthResponseDto> {
    const { email, code } = dto;

    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.resetCode || user.resetCode !== code) {
      throw new BadRequestException('Invalid reset code');
    }

    if (!user.resetCodeExpires || new Date() > user.resetCodeExpires) {
      throw new BadRequestException('Reset code expired');
    }

    return {
      message: 'Reset code verified',
      user: this.sanitizeUser(user),
      success: true,
    };
  }

  async finishResetPassword(
    dto: ResetPasswordFinishDto,
  ): Promise<AuthResponseDto> {
    const { email, newPassword, confirmPassword } = dto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.resetCode) {
      throw new BadRequestException('No active reset request');
    }

    if (!user.resetCodeExpires || new Date() > user.resetCodeExpires) {
      throw new BadRequestException('Reset code expired');
    }

    user.password = await PasswordHashingHelper.hashPassword(newPassword);

    user.resetCode = null;
    user.resetCodeExpires = null;

    await this.userRepository.save(user);

    return { message: 'Password reset successful', success: true };
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  public sanitizeUser(user: User): SanitizedUser {
    const {
      password: _password,
      verificationCode: _verificationCode,
      verificationExpires: _verificationExpires,
      resetCode: _resetCode,
      resetCodeExpires: _resetCodeExpires,
      ...result
    } = user;
    return result;
  }

  async refreshTokens(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const { accessToken, refreshToken: newRefreshToken } = await getTokens(
        this.jwtService,
        user.id,
        user.email
      );

      return {
        success: true,
        message: 'Tokens refreshed successfully',
        token: accessToken,
        refreshToken: newRefreshToken,
        user: this.sanitizeUser(user),
      };
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async updateUser(userId: string, dto: any): Promise<any> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      // ✅ Convert dateOfBirth string → Date
      if (dto.dateOfBirth) {
        dto.dateOfBirth = new Date(dto.dateOfBirth) as any;
      }

      // ✅ Hash password ONLY if provided
      if (dto.password) {
        dto.password = await this.passwordUtil.hashPassword(dto.password);
      }

      Object.assign(user, dto);

      await this.userRepository.save(user);

      return {
        success: true,
        data: user,
        message: 'User updated successfully',
      };
    } catch (error) {
      console.log('Update user error:', error);
      return {
        success: false,
        message: 'Failed to update user',
        error: error.message,
      };
    }
  }
}
