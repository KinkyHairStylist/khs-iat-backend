import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from '../entities/appointment.entity';
import { parseApptDateTime } from '../utils/appointment-display-status';
import { NotificationService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/notification.enum';

// Fires the "your service has started" client notification the moment an
// appointment's window opens — the same moment computeDisplayStatus would
// start showing it as "Ongoing" (reuses parseApptDateTime so the two never
// disagree). serviceStartedNotifiedAt is the idempotency flag, set once
// this fires so a later run doesn't repeat it. Requires
// scripts/add-service-started-notified-column.ts run before deploy.
@Injectable()
export class AppointmentServiceStartedCronService {
  private readonly logger = new Logger(AppointmentServiceStartedCronService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleMinuteSweep(): Promise<void> {
    // No date filter in SQL: appointment.date/.time are wall-clock display
    // strings, not a real timestamp column, so there's no timezone-safe way
    // to narrow this in the query itself — parseApptDateTime (the same
    // parser computeDisplayStatus uses for "Ongoing") is the source of
    // truth for whether a given row's window has actually opened. The
    // status + serviceStartedNotifiedAt filter already keeps this cheap:
    // completed/cancelled/no-show/already-notified rows never match.
    const candidates = await this.appointmentRepo.find({
      where: {
        status: In([AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED]),
        serviceStartedNotifiedAt: IsNull(),
      },
      relations: ['client', 'business'],
    });

    const now = new Date();

    for (const appointment of candidates) {
      const start = parseApptDateTime(appointment.date, appointment.time);
      if (isNaN(start.getTime()) || now < start) continue;

      if (!appointment.client?.id) continue;

      try {
        await this.notificationService.create({
          userId: appointment.client.id,
          type: NotificationType.SYSTEM,
          title: 'Your Service Has Started',
          message: `Your appointment at ${appointment.business?.businessName || 'the salon'} for ${appointment.serviceName} has started.`,
          link: '/customer/appointment',
          metadata: {
            appointmentId: appointment.id,
            salonId: appointment.business?.id,
            salonName: appointment.business?.businessName,
          },
        });

        appointment.serviceStartedNotifiedAt = now;
        await this.appointmentRepo.save(appointment);
      } catch (error) {
        this.logger.error(
          `Failed to send service-started notification for appointment ${appointment.id}: ${error.message}`,
          error.stack,
        );
        // Left unmarked on failure so the next minute's sweep retries it,
        // matching the "no automatic retry, but no silent loss either"
        // posture of the other appointment-status notifications.
      }
    }
  }
}
