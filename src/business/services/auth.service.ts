import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../all_user_entities/user.entity';
import { RefreshToken } from '../entities/refresh.token.entity';
import { CreateUserDto } from '../dtos/requests/CreateUserDto';
import { LoginDto } from '../dtos/requests/LoginDto';
import { ForgotPasswordDto } from '../dtos/requests/ForgotPasswordDto';
import { ResetPasswordDto } from '../dtos/requests/ResetPasswordDto';
import { VerifyPasswordOtpDto } from '../dtos/requests/VerifyPasswordOtpDto';
import { PasswordUtil } from '../utils/password.util';
import { OtpService } from './otp.service';
import { Gender } from '../types/constants';
import { RequestPhoneOtpDto } from '../dtos/requests/RequestPhoneOtpDto';
import { VerifyPhoneOtpDto } from '../dtos/requests/VerifyPhoneOtpDto';
import {Staff} from "../entities/staff.entity";
import { Business } from '../entities/business.entity';
import { BusinessService } from './business.service';
import { getTokens } from '../../helpers/token.helper';
import { CompanySize } from '../types/constants';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Staff)
    private staffRepo: Repository<Staff>,

    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    private readonly jwtService: JwtService,
    private readonly passwordUtil: PasswordUtil,
    private readonly otpService: OtpService,
    private readonly businessService: BusinessService,
  ) {}

  async register(createUserDto: CreateUserDto): Promise<TokenPair> {
    const { email, password, phoneNumber, verificationToken } = createUserDto;

    let verifiedEmail: string;
    let payload: { sub: string; email: string };
    try {
      payload = await this.jwtService.verifyAsync(verificationToken, {
        secret: process.env.JWT_ACCESS_SECRET,
      });

      if (payload.email.toLowerCase() !== email.toLowerCase()) {
        throw new BadRequestException(
          'Token email mismatch. Registration aborted.',
        );
      }
      verifiedEmail = payload.email;
    } catch (e) {
      throw new UnauthorizedException(
        `Invalid or expired verification token. ${e}`,
      );
    }

    const processedDto = { ...createUserDto };
    if (processedDto.gender) {
      const genderValue = processedDto.gender.toUpperCase();
      if (!(genderValue in Gender)) {
        throw new BadRequestException(
          `Invalid gender value: ${processedDto.gender}`,
        );
      }
      processedDto.gender = Gender[genderValue as keyof typeof Gender] as any;
    }

    await this.checkExistingUser(verifiedEmail, phoneNumber);
    this.passwordUtil.validatePasswordStrength(password);

    const user = await this.createUser(processedDto);

    return getTokens(this.jwtService, user.id, user.email);
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: { sub: string; email: string };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch (e) {
      throw new UnauthorizedException(`Invalid or expired refresh token. ${e}`);
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('User associated with token not found.');
    }

    const storedToken = await this.refreshTokenRepo.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalidated refresh token.');
    }

    const hashMatch = await this.passwordUtil.comparePassword(
      refreshToken,
      storedToken.tokenHash,
    );

    if (!hashMatch) {
      await this.refreshTokenRepo.delete({ user: { id: user.id } });
      throw new UnauthorizedException('Token mismatch. All tokens revoked.');
    }

    await this.refreshTokenRepo.delete(storedToken.id);

    return getTokens(this.jwtService, user.id, user.email);
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string; message?: string; role?: any; settings?: any }> {
    const { email, password } = loginDto;

    const user = await this.userRepo.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('No user');
    }

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException(
        'Account is not verified. Please verify your email.',
      );
    }

    if (user.isSuspended) {
      throw new UnauthorizedException('user has been suspended');
    }

    let message: string | undefined;

    // Check isBusiness field directly on user (merged from UserRole)
    if (!user.isBusiness) {
      message = 'This is not a business account. Kindly create a new business account.';
      throw new UnauthorizedException(message);
    }

    const userBusiness = await this.businessRepo.findOne({
      where: { ownerId: user.id },
    });

    if (!userBusiness) {
      message = 'User does not own a business yet. Please create a business.';
      throw new UnauthorizedException(message);
    }

    const passwordMatch = await this.passwordUtil.comparePassword(
      password,
      user.password,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const tokens = await getTokens(this.jwtService, user.id, user.email);
    
    // Return role information for frontend - create role object from user fields
    const role = {
      isSuperAdmin: user.isSuperAdmin,
      isAdmin: user.isAdmin,
      isBusiness: user.isBusiness,
      isClient: user.isClient,
      isStaff: user.isStaff,
      isManager: user.isManager,
      isBusinessAdmin: user.isBusinessAdmin,
    };
    
    return { 
      ...tokens, 
      message,
      role
    };
  }

  private async createUser(createUserDto: CreateUserDto): Promise<User> {
    const { password, verificationToken, ...rest } = createUserDto;
    const hashedPassword = await this.passwordUtil.hashPassword(password);

    try {

      const newUser = this.userRepo.create({
        ...(rest as Partial<User>),
        password: hashedPassword,
        isVerified: true,
        suspensionHistory: '.',
        isSuspended: false,
        // Set role fields directly on user (merged from UserRole entity)
        isBusiness: true,
        isClient: false, // Business users are not regular clients
      });

      const savedUser = await this.userRepo.save(newUser);

      return savedUser;
      
    } catch (error) {
      console.error('Error creating user:', error);
      throw new BadRequestException('Failed to create user. Please try again.');
    }
  }

  private async checkExistingUser(
    email: string,
    phoneNumber: string,
  ): Promise<void> {
    const existingUser = await this.userRepo.findOne({
      where: [{ email }, { phoneNumber }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('User with this email already exists');
      }
      if (existingUser.phoneNumber === phoneNumber) {
        throw new ConflictException(
          'User with this phone number already exists',
        );
      }
    }
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.userRepo.update(userId, { isVerified: true });
  }


  async requestPasswordReset(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;

    const user = await this.userRepo.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return {
        message:
          'If a user with that email exists, an OTP code has been sent to their email.',
      };
    }

    try {
      await this.otpService.requestOtpForPasswordReset(email);
    } catch (error) {
      console.error(`Failed to generate/send OTP for ${email}:`, error);
    }

    return {
      message:
        'If a user with that email exists, an OTP code has been sent to their email.',
    };
  }

  async verifyPasswordOtp(
    verifyPasswordOtpDto: VerifyPasswordOtpDto,
  ): Promise<{ resetToken: string }> {
    const { email, otp } = verifyPasswordOtpDto;

    const isOtpValid = await this.otpService.verifyOtp(email, otp);
    if (!isOtpValid) {
      throw new BadRequestException('Invalid or expired OTP code.');
    }

    const user = await this.userRepo.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      purpose: 'password-reset',
    };

    const resetToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });

    // Remove OTP after use
    await this.otpService.deleteOtp(email);

    return { resetToken };
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const { token, newPassword } = resetPasswordDto;

    let payload: { sub: string; email: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    const hashedPassword = await this.passwordUtil.hashPassword(newPassword);

    const result = await this.userRepo.update(payload.sub, {
      password: hashedPassword,
    });

    if (result.affected === 0) {
      throw new NotFoundException('User not found or password not updated.');
    }

    await this.refreshTokenRepo.delete({ user: { id: payload.sub } });

    return {
      message:
        'Password reset successfully. Please log in with your new password.',
    };
  }

  async requestPhoneOtp(requestPhoneOtpDto: RequestPhoneOtpDto) {
    const { phone } = requestPhoneOtpDto;

    const otp = await this.otpService.generatePhoneOtp(phone);
    const deliveryResult = await this.otpService.sendPhoneSmsOtp(phone, otp);

    return {
      message: deliveryResult.fallbackMode
        ? 'OTP generated successfully. Check the server logs for the code in local/dev mode.'
        : 'OTP sent successfully to your phone number.',
      phone,
      ...(deliveryResult.fallbackMode &&
      process.env.NODE_ENV !== 'production' &&
      deliveryResult.otp
        ? { otp: deliveryResult.otp }
        : {}),
    };
  }

  async verifyPhoneNumber(verifyPhoneOtpDto: VerifyPhoneOtpDto) {
    const { phoneNumber, otp } = verifyPhoneOtpDto;

    const isValid = await this.otpService.verifyPhoneOtpService(
      phoneNumber,
      otp,
    );
    if (!isValid) {
      throw new BadRequestException('Invalid or expired OTP.');
    }

    const user = await this.userRepo.findOne({ where: { phoneNumber } });
    if (user) {
      user.isVerified = true;
      await this.userRepo.save(user);
    }

    return {
      message: 'Phone number verified successfully.',
      verified: true,
      phoneNumber,
    };
  }

  async findOneById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { email: email.toLowerCase() },
      select: ['id', 'email', 'password', 'isVerified', 'phoneNumber'],
    });
  }

}
