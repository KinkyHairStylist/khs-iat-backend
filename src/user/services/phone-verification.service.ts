import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../../all_user_entities/user.entity';
import { ConfigService } from '@nestjs/config';
import * as Twilio from 'twilio';

@Injectable()
export class PhoneVerificationService {
  private twilioClient: Twilio.Twilio;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    this.twilioClient = new Twilio.Twilio(
      this.configService.get('TWILIO_ACCOUNT_SID'),
      this.configService.get('TWILIO_AUTH_TOKEN'),
    );
  }

  //  Send verification code
  async sendVerificationCode(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.phoneNumber) {
      throw new BadRequestException('User does not have a phone number');
    }

    // Generate random 6-digit code
    const code = Math.floor(10000 + Math.random() * 90000).toString();

    user.verificationCode = code;
    user.verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry
    await this.userRepository.save(user);

    // Send SMS via Twilio
    await this.twilioClient.messages.create({
      body: `💇‍♀️ ${this.configService.get('PROJECT_NAME')}: Your verification code is ${code}`,
      messagingServiceSid: this.configService.get('TWILIO_MESSAGING_SERVICE_SID'),
      to: user.phoneNumber,
    });

    return { message: 'Verification code sent successfully' };
  }

  // Confirm verification code
  async verifyCode(userId: string, code: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.verificationCode !== code) {
      throw new BadRequestException('Invalid verification code');
    }

    if (user.verificationExpires && user.verificationExpires < new Date()) {
      throw new BadRequestException('Verification code expired');
    }

    user.isVerified = true;
    user.verificationCode = null;
    user.verificationExpires = null;
    await this.userRepository.save(user);

    return { message: 'Phone number verified successfully' };
  }
}
