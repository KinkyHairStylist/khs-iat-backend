import {
  BadRequestException,
  Injectable,
  Logger,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { EmailVerification } from '../entities/email-verification.entity';
import { PhoneVerification } from '../entities/phone-verification.entity';
import { AuthService } from './auth.service';
import { EmailService } from '../../email/email.service';
import * as crypto from 'crypto';

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_LENGTH = 5;
  private readonly EXPIRATION_MINUTES = 15;
  private readonly MAX_TRIALS = 5;

  constructor(
    @InjectRepository(EmailVerification)
    private readonly otpRepo: Repository<EmailVerification>,
    @InjectRepository(PhoneVerification)
    private readonly phoneOtpRepo: Repository<PhoneVerification>,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => AuthService))
    private readonly userService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  async requestOtpForPasswordReset(email: string): Promise<void> {
    const otp = this.generateOtp();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.EXPIRATION_MINUTES);

    let otpRecord = await this.otpRepo.findOne({ where: { email } });

    if (!otpRecord) {
      otpRecord = this.otpRepo.create({
        email,
        otp: hashOtp(otp),
        expiresAt,
        trials: 0,
        maxTrials: this.MAX_TRIALS,
      });
    } else {
      otpRecord.otp = hashOtp(otp);
      otpRecord.expiresAt = expiresAt;
      otpRecord.trials = 0;
      otpRecord.maxTrials = this.MAX_TRIALS;
    }

    await this.otpRepo.save(otpRecord);
    this.logger.debug(`OTP generated for email ${email}`);

    await this.emailService.sendOtpEmail(email, otp, 'password_reset');
  }

  async requestOtp(email: string): Promise<void> {
    const existingUser = await this.userService.findByEmail(email);
    if (existingUser && existingUser.isVerified) {
      throw new ConflictException(
        'This email is already registered and verified.',
      );
    }

    const otp = this.generateOtp();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.EXPIRATION_MINUTES);

    let otpRecord = await this.otpRepo.findOne({ where: { email } });

    if (!otpRecord) {
      otpRecord = this.otpRepo.create({
        email,
        otp: hashOtp(otp),
        expiresAt,
        trials: 0,
        maxTrials: this.MAX_TRIALS,
      });
    } else {
      otpRecord.otp = hashOtp(otp);
      otpRecord.expiresAt = expiresAt;
      otpRecord.trials = 0;
      otpRecord.maxTrials = this.MAX_TRIALS;
    }

    await this.otpRepo.save(otpRecord);
    this.logger.debug(`OTP generated for email ${email}`);

    await this.emailService.sendOtpEmail(email, otp, 'verification');
  }

  async verifyOtp(
    email: string,
    providedOtp: string,
  ): Promise<{ verificationToken: string }> {
    const otpRecord = await this.otpRepo.findOne({ where: { email } });

    if (!otpRecord) {
      throw new BadRequestException(
        'Verification required. Please request a new OTP.',
      );
    }

    if (otpRecord.trials >= otpRecord.maxTrials) {
      await this.otpRepo.delete({ email });
      throw new ConflictException(
        'Maximum verification attempts reached. Please request a new OTP.',
      );
    }

    if (!timingSafeEqual(otpRecord.otp, hashOtp(providedOtp))) {
      otpRecord.trials += 1;
      await this.otpRepo.save(otpRecord);
      throw new BadRequestException('Invalid OTP provided.');
    }

    if (new Date() > otpRecord.expiresAt) {
      await this.otpRepo.delete({ email });
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    await this.otpRepo.delete({ email });

    const verificationToken = await this.jwtService.signAsync(
      { email },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '20m',
      },
    );

    this.logger.log(
      `Email ${email} successfully verified. Verification token issued.`,
    );
    return { verificationToken };
  }

  async deleteOtp(email: string): Promise<void> {
    await this.otpRepo.delete({ email });
  }

  private generateOtp(): string {
    const min = Math.pow(10, this.OTP_LENGTH - 1);
    const max = Math.pow(10, this.OTP_LENGTH) - 1;
    return crypto.randomInt(min, max).toString();
  }

  async generatePhoneOtp(phone: string): Promise<string> {
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.EXPIRATION_MINUTES);

    let phoneOtpRecord = await this.phoneOtpRepo.findOne({
      where: { phoneNumber: phone },
    });

    if (!phoneOtpRecord) {
      phoneOtpRecord = this.phoneOtpRepo.create({
        phoneNumber: phone,
        otp: hashOtp(otp),
        expiresAt,
        trials: 0,
        maxTrials: this.MAX_TRIALS,
      });
    } else {
      phoneOtpRecord.otp = hashOtp(otp);
      phoneOtpRecord.expiresAt = expiresAt;
      phoneOtpRecord.trials = 0;
      phoneOtpRecord.maxTrials = this.MAX_TRIALS;
    }

    await this.phoneOtpRepo.save(phoneOtpRecord);
    this.logger.debug(`Phone OTP generated for ${phone}`);
    return otp;
  }

  async sendPhoneSmsOtp(
    phone: string,
    otp: string,
  ): Promise<{ delivered: boolean; fallbackMode: boolean; otp?: string }> {
    const hasTwilioConfig = Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_MESSAGING_SERVICE_SID,
    );

    if (!hasTwilioConfig) {
      const fallbackMode = process.env.NODE_ENV !== 'production';
      if (fallbackMode) {
        this.logger.warn(`[Phone OTP fallback] Twilio not configured — OTP delivery skipped for ${phone}`);
      }
      return {
        delivered: false,
        fallbackMode,
        otp: fallbackMode ? otp : undefined,
      };
    }

    return { delivered: true, fallbackMode: false };
  }

  async verifyPhoneOtpService(phone: string, otp: string): Promise<boolean> {
    const phoneOtpRecord = await this.phoneOtpRepo.findOne({
      where: { phoneNumber: phone },
    });

    if (!phoneOtpRecord) {
      throw new BadRequestException('Please request a new OTP.');
    }

    if (phoneOtpRecord.trials >= phoneOtpRecord.maxTrials) {
      await this.phoneOtpRepo.delete({ phoneNumber: phone });
      throw new ConflictException(
        'Maximum verification attempts reached. Please request a new OTP.',
      );
    }

    if (!timingSafeEqual(phoneOtpRecord.otp, hashOtp(otp))) {
      phoneOtpRecord.trials += 1;
      await this.phoneOtpRepo.save(phoneOtpRecord);
      throw new BadRequestException('Invalid OTP provided.');
    }

    if (new Date() > phoneOtpRecord.expiresAt) {
      await this.phoneOtpRepo.delete({ phoneNumber: phone });
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    await this.phoneOtpRepo.delete({ phoneNumber: phone });
    return true;
  }
}
