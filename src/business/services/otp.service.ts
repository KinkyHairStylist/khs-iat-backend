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
        otp,
        expiresAt,
        trials: 0,
        maxTrials: this.MAX_TRIALS,
      });
    } else {
      otpRecord.otp = otp;
      otpRecord.expiresAt = expiresAt;
      otpRecord.trials = 0;
      otpRecord.maxTrials = this.MAX_TRIALS;
    }

    await this.otpRepo.save(otpRecord);
    this.logger.debug(`OTP generated for email ${email}`);

    const subject = 'Forgotten Password Otp';
    await this.emailService.sendEmail(email, subject, otp);
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
        otp,
        expiresAt,
        trials: 0,
        maxTrials: this.MAX_TRIALS,
      });
    } else {
      otpRecord.otp = otp;
      otpRecord.expiresAt = expiresAt;
      otpRecord.trials = 0;
      otpRecord.maxTrials = this.MAX_TRIALS;
    }

    await this.otpRepo.save(otpRecord);
    this.logger.debug(`OTP generated for email ${email}`);

    const subject = 'Email Verification';
    await this.emailService.sendEmail(email, subject, otp);
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

    if (otpRecord.otp !== providedOtp) {
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
    return Math.floor(
      Math.pow(10, this.OTP_LENGTH - 1) +
        Math.random() * 9 * Math.pow(10, this.OTP_LENGTH - 1),
    ).toString();
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
        otp,
        expiresAt,
        trials: 0,
        maxTrials: this.MAX_TRIALS,
      });
    } else {
      phoneOtpRecord.otp = otp;
      phoneOtpRecord.expiresAt = expiresAt;
      phoneOtpRecord.trials = 0;
      phoneOtpRecord.maxTrials = this.MAX_TRIALS;
    }

    await this.phoneOtpRepo.save(phoneOtpRecord);
    this.logger.debug(`Phone OTP generated for ${phone}: ${otp}`);
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
      const message = fallbackMode
        ? `[Phone OTP fallback] OTP for ${phone}: ${otp}`
        : `OTP for ${phone}: ${otp}`;

      console.warn(message);
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

    if (phoneOtpRecord.otp !== otp) {
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
