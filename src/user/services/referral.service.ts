import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import { NotFoundException } from '@nestjs/common';

import { Referral } from '../user_entities/referrals.entity';
import { User } from '../../all_user_entities/user.entity';
import {
  Appointment,
  AppointmentStatus,
} from 'src/business/entities/appointment.entity';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,

    private readonly emailService: EmailService,
  ) {}

  // Generate unique referral code
  generateReferralCode(): string {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  // Ensure user has a referral code
  async ensureReferralCode(id: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.referralCode) {
      user.referralCode = this.generateReferralCode();
      await this.userRepository.save(user);
    }

    return user.referralCode;
  }

  //  When a user registers through a referral link
  async createReferral(
    referrerId: string,
    referredEmail: string,
    referralCode: string,
  ) {
    const referral = this.referralRepository.create({
      referrerId,
      referredEmail,
      referralCode,
      status: 'pending',
      earning: 20,
    });

    return await this.referralRepository.save(referral);
  }

  //  When the referred user successfully signs up or completes verification
  async completeReferral(referredEmail: string, referredUserId: string) {
    const referral = await this.referralRepository.findOne({
      where: { referredEmail },
      relations: ['referrer'], // to update referrer's earnings
    });

    if (!referral) return null;

    referral.status = 'completed';
    referral.referredUserId = referredUserId;
    referral.isPaid = false;

    await this.referralRepository.save(referral);

    //  Update referrer’s earnings
    const referrer = referral.referrer;
    referrer.totalEarnings += Number(referral.earning);
    referrer.availableEarnings += Number(referral.earning);

    await this.userRepository.save(referrer);

    try {
      const referrerName = `${referrer.firstName} ${referrer.surname}`;
      this.emailService.sendReferralConfirmedEmail(
        referrer.email,
        referrerName,
        referral.referredEmail,
        referral.earning.toString(),
        'NGN',
      );
    } catch (error) {
      this.logger.error(
        `Failed to send referral confirmed email: ${error.message}`,
      );
    }

    return referral;
  }

  //  Get referral and booking stats for a given user
  async getReferralStats(userId: string) {
    //  Find all referrals created by this user
    const referrals = await this.referralRepository.find({
      where: { referrerId: userId },
    });

    const totalReferrals = referrals.length;

    // Get all referred user IDs (only for completed referrals)
    const completedReferrals = referrals.filter(
      (r) => r.status === 'completed' && r.referredUserId,
    );
    const referredUserIds = completedReferrals.map((r) => r.referredUserId);

    // Count successful bookings from referred users
    const successfulBookings = referredUserIds.length
      ? await this.appointmentRepository.count({
          where: {
            client: In(referredUserIds),
            status: AppointmentStatus.CONFIRMED,
          },
        })
      : 0;

    // Compute earnings
    const totalEarnings = successfulBookings * 20;
    const pendingEarnings = (totalReferrals - successfulBookings) * 20;

    return {
      totalReferrals,
      successfulBookings,
      totalEarnings,
      pendingEarnings,
    };
  }

  async getUserReferrals(referrerId: string) {
    const referrals = await this.referralRepository.find({
      where: { referrerId },
      relations: ['referrer'],
      order: { createdAt: 'DESC' },
    });

    const referredUserIds = referrals
      .filter((r) => r.referredUserId)
      .map((r) => r.referredUserId);

    const referredUsers = referredUserIds.length
      ? await this.userRepository.find({
          where: { id: In(referredUserIds) },
        })
      : [];

    const referredUserMap = new Map(
      referredUsers.map((u) => [u.id, u]),
    );

    return referrals.map((ref) => {
      const referredUser = ref.referredUserId
        ? referredUserMap.get(ref.referredUserId)
        : null;

      return {
        referredEmail: ref.referredEmail,
        referredUserId: ref.referredUserId,
        referredName: referredUser
          ? `${referredUser.firstName} ${referredUser.surname}`
          : 'Pending user',
        dateReferred: ref.createdAt,
        status: ref.status,
        earning: Number(ref.earning),
      };
    });
  }

  // Get referral link
  async getReferralLink(userId: string): Promise<string> {
    const referralCode = await this.ensureReferralCode(userId);
    return `${process.env.FRONTEND_URL}/?ref=${referralCode}`;
  }
}
