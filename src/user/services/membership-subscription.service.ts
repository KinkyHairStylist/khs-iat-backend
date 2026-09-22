import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MembershipSubscription } from '../user_entities/membership-subscription.entity';
import { User } from 'src/all_user_entities/user.entity';
import {
  Appointment,
  AppointmentStatus,
} from 'src/business/entities/appointment.entity';
import { EmailService } from 'src/email/email.service';

// The old KHS-wide plans are no longer sold: there is no buying, upgrading or downgrading. Someone
// who already holds one can still see it and cancel it. Salons' own membership packages are handled
// by MembershipPackagePurchaseService.
@Injectable()
export class MembershipService {
  private readonly logger = new Logger(MembershipService.name);

  constructor(
    @InjectRepository(MembershipSubscription)
    private readonly subscriptionRepo: Repository<MembershipSubscription>,

    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  async getUserSubscriptions(userId: string) {
    return this.subscriptionRepo.find({ where: { userId } });
  }

  // Get active subscription for a user
  async getUserSubscription(userId: string) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId, status: 'active' },
      relations: ['tier'],
    });

    if (!subscription) {
      throw new NotFoundException('No active membership found.');
    }

    const formatDateOnly = (value: string | Date) => {
      if (!value) return null;
      if (typeof value === 'string') return value;
      return value.toISOString().split('T')[0];
    };

    const appointmentRepo = this.dataSource.getRepository(Appointment);

    const startDate = formatDateOnly(subscription.startDate);
    const endDate = formatDateOnly(subscription.endDate);
    let usageHistory: Array<{
      service: string;
      location: string;
      date: string;
      time: string;
    }> = [];
    let effectiveRemainingSessions = Number(subscription.remainingSessions);

    if (startDate && endDate) {
      try {
        const totalUsageCount = await appointmentRepo
          .createQueryBuilder('appointment')
          .where('appointment.client_id = :userId', { userId })
          .andWhere('appointment.status IN (:...statuses)', {
            statuses: [
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.COMPLETED,
            ],
          })
          .andWhere('appointment.date >= :startDate', { startDate })
          .andWhere('appointment.date <= :endDate', { endDate })
          .getCount();

        const usageAppointments = await appointmentRepo
          .createQueryBuilder('appointment')
          .leftJoinAndSelect('appointment.business', 'business')
          .where('appointment.client_id = :userId', { userId })
          .andWhere('appointment.status IN (:...statuses)', {
            statuses: [
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.COMPLETED,
            ],
          })
          .andWhere('appointment.date >= :startDate', { startDate })
          .andWhere('appointment.date <= :endDate', { endDate })
          .orderBy('appointment.date', 'DESC')
          .addOrderBy('appointment.time', 'DESC')
          .limit(5)
          .getMany();

        usageHistory = usageAppointments.map((appointment) => ({
          service: appointment.serviceName,
          location: appointment.business?.businessName || 'Unknown location',
          date: appointment.date,
          time: appointment.time,
        }));

        effectiveRemainingSessions = Math.max(
          Number(subscription.tier.session) - totalUsageCount,
          0,
        );
      } catch (error) {
        this.logger.error(
          `Failed to load membership usage for user ${userId}: ${error?.message || error}`,
          error as any,
        );
      }
    }

    return {
      ...subscription,
      remainingSessions: Number.isNaN(effectiveRemainingSessions)
        ? Number(subscription.remainingSessions)
        : effectiveRemainingSessions,
      usageHistory,
    };
  }

  // Cancel active membership
  async cancelMembership(userId: string) {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId, status: 'active' },
      relations: ['tier'],
    });

    if (!subscription) {
      throw new NotFoundException('No active membership found.');
    }

    subscription.status = 'cancelled';
    subscription.endDate = new Date();
    subscription.cancelledAt = new Date(); // Record cancellation timestamp

    await this.subscriptionRepo.save(subscription);

    try {
      const user = await this.dataSource
        .getRepository(User)
        .findOne({ where: { id: userId } });
      if (user?.email) {
        this.emailService.sendMembershipEmail(
          user.email,
          user.firstName || 'Valued Customer',
          'cancelled',
          subscription.tier?.name || 'Membership',
          undefined,
          undefined,
          undefined,
          new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        );
      }
    } catch (e) {
      this.logger.error('Failed to send cancellation email', e);
    }

    return { message: 'Membership cancelled successfully.' };
  }
}
