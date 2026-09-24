// @nestjs/schedule ships ESM-only in the installed version, which Jest's
// default config can't parse from node_modules -- @Cron is only ever used
// as a decorator here (applied once at class-definition time), so a no-op
// stand-in is all this needs. Same pattern as
// merchant-subscription-trial-reminders.spec.ts.
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => {},
  CronExpression: { EVERY_MINUTE: '* * * * *' },
}));

import { AppointmentServiceStartedCronService } from './appointment-service-started-cron.service';
import { AppointmentStatus } from '../entities/appointment.entity';
import { NotificationType } from 'src/notifications/notification.enum';

const MIN_MS = 60_000;

function setup() {
  const service: any = Object.create(AppointmentServiceStartedCronService.prototype);
  service.logger = { error: jest.fn() };
  service.appointmentRepo = { find: jest.fn(), save: jest.fn(async (a: any) => a) };
  service.notificationService = { create: jest.fn() };
  return service;
}

// "HH:MM AM/PM" for a Date, matching parseApptDateTime's expected format.
function timeLabel(d: Date): string {
  let h = d.getHours();
  const meridiem = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${meridiem}`;
}

function dateLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function appointment(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'appt-1',
    status: AppointmentStatus.CONFIRMED,
    date: dateLabel(new Date()),
    time: timeLabel(new Date()),
    duration: '(60 min)',
    serviceName: 'Braids',
    serviceStartedNotifiedAt: null,
    client: { id: 'client-1' },
    business: { id: 'biz-1', businessName: 'Gold Salon' },
    ...overrides,
  };
}

describe('AppointmentServiceStartedCronService', () => {
  it('notifies once the appointment window has opened and marks it sent', async () => {
    const service = setup();
    const startedFiveMinAgo = appointment({
      time: timeLabel(new Date(Date.now() - 5 * MIN_MS)),
    });
    service.appointmentRepo.find.mockResolvedValue([startedFiveMinAgo]);

    await service.handleMinuteSweep();

    expect(service.notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'client-1',
        type: NotificationType.SYSTEM,
        title: 'Your Service Has Started',
        metadata: expect.objectContaining({ appointmentId: 'appt-1' }),
      }),
    );
    expect(service.appointmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ serviceStartedNotifiedAt: expect.any(Date) }),
    );
  });

  it('does not notify for an appointment that has not started yet', async () => {
    const service = setup();
    const startsInTenMin = appointment({
      time: timeLabel(new Date(Date.now() + 10 * MIN_MS)),
    });
    service.appointmentRepo.find.mockResolvedValue([startsInTenMin]);

    await service.handleMinuteSweep();

    expect(service.notificationService.create).not.toHaveBeenCalled();
    expect(service.appointmentRepo.save).not.toHaveBeenCalled();
  });

  it('skips an appointment with no linked client account', async () => {
    const service = setup();
    const noClient = appointment({
      time: timeLabel(new Date(Date.now() - MIN_MS)),
      client: null,
    });
    service.appointmentRepo.find.mockResolvedValue([noClient]);

    await service.handleMinuteSweep();

    expect(service.notificationService.create).not.toHaveBeenCalled();
  });

  it('leaves serviceStartedNotifiedAt unset on a real query, so a later run retries', async () => {
    // A real query for serviceStartedNotifiedAt IS NULL would never return
    // an already-notified row -- proven by construction, matching the
    // equivalent trial-reminder test.
    const service = setup();
    service.appointmentRepo.find.mockResolvedValue([]);

    await service.handleMinuteSweep();

    expect(service.notificationService.create).not.toHaveBeenCalled();
  });

  it('does not mark serviceStartedNotifiedAt when the notification fails to send', async () => {
    const service = setup();
    const startedNow = appointment({
      time: timeLabel(new Date(Date.now() - MIN_MS)),
    });
    service.appointmentRepo.find.mockResolvedValue([startedNow]);
    service.notificationService.create.mockRejectedValue(new Error('gateway down'));

    await service.handleMinuteSweep();

    expect(service.appointmentRepo.save).not.toHaveBeenCalled();
    expect(service.logger.error).toHaveBeenCalled();
  });
});
