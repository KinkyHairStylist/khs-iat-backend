import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  Appointment,
  AppointmentStatus,
} from 'src/business/entities/appointment.entity';
import { Business } from 'src/business/entities/business.entity';
import { StripePaymentIntent } from 'src/payment/entities/stripe-payment-intent.entity';
import { GoogleCalendarService } from './google-calendar.service';
import { MailchimpService } from './mailchimp.service';
import { ZohoBooksService } from './zohobooks.service';
import { IntegrationAuthError } from '../integration.helpers';

// One place that keeps a salon's connected apps in step with its bookings, so
// every way a booking can be confirmed, moved or cancelled (card, gift card,
// membership, ...) syncs the same way. Every step is best effort: a failing
// integration is logged and never blocks or fails the booking.
@Injectable()
export class IntegrationSyncService {
  private readonly logger = new Logger(IntegrationSyncService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(StripePaymentIntent)
    private readonly stripePaymentRepo: Repository<StripePaymentIntent>,
    private readonly google: GoogleCalendarService,
    private readonly mailchimp: MailchimpService,
    private readonly zoho: ZohoBooksService,
  ) {}

  // Runs one integration's step for a salon if it is connected. If the saved
  // credentials turn out to be dead, the integration is marked disconnected so
  // the merchant sees "Connect" again instead of silently losing sync.
  private async guarded(
    name: string,
    business: Business,
    isConnected: (businessId: string) => Promise<boolean>,
    markDisconnected: (businessId: string, ownerId: string) => Promise<void>,
    step: () => Promise<void>,
  ): Promise<void> {
    try {
      if (!(await isConnected(business.id))) return;
      await step();
    } catch (error) {
      if (error instanceof IntegrationAuthError) {
        this.logger.warn(`${name} credentials no longer work for business ${business.id}; disconnecting.`);
        await markDisconnected(business.id, business.ownerId).catch((err) =>
          this.logger.error(`Could not mark ${name} disconnected: ${err.message}`),
        );
        return;
      }
      this.logger.error(`${name} sync failed for business ${business.id}: ${error.message}`);
    }
  }

  private google_(business: Business, step: () => Promise<void>) {
    return this.guarded(
      'Google Calendar',
      business,
      (id) => this.google.isConnected(id),
      (id, owner) => this.google.markDisconnected(id, owner),
      step,
    );
  }

  private mailchimp_(business: Business, step: () => Promise<void>) {
    return this.guarded(
      'Mailchimp',
      business,
      (id) => this.mailchimp.isConnected(id),
      (id, owner) => this.mailchimp.markDisconnected(id, owner),
      step,
    );
  }

  private zoho_(business: Business, step: () => Promise<void>) {
    return this.guarded(
      'ZohoBooks',
      business,
      (id) => this.zoho.isConnected(id),
      (id, owner) => this.zoho.markDisconnected(id, owner),
      step,
    );
  }

  /** A booking was confirmed (paid, or otherwise secured). */
  async onBookingConfirmed(orderId: string): Promise<void> {
    const appointments = (
      await this.appointmentRepo.find({ where: { orderId }, relations: ['business'] })
    ).filter((a) => a.status !== AppointmentStatus.CANCELLED);
    if (appointments.length === 0) return;
    const business = appointments[0].business;

    const payment = await this.stripePaymentRepo.findOne({ where: { orderId } });
    const paidShare = payment?.isDeposit ? 0.5 : 1;
    const paymentMode = payment ? 'creditcard' : 'others';

    await Promise.all([
      this.google_(business, async () => {
        for (const appointment of appointments) {
          if (appointment.googleEventId) {
            await this.google.updateCalendarEvent(appointment.id, appointment.googleEventId);
            continue;
          }
          const eventId = await this.google.createCalendarEvent(appointment.id);
          await this.appointmentRepo.update(appointment.id, { googleEventId: eventId });
        }
      }),
      this.mailchimp_(business, async () => {
        // One client per order, so one contact upsert.
        await this.mailchimp.syncContact(appointments[0].id);
      }),
      this.zoho_(business, async () => {
        for (const appointment of appointments) {
          const { invoiceId, created } = await this.zoho.ensureInvoice(appointment.id);
          if (!created) continue;
          const paid = Math.round(Number(appointment.amount) * paidShare * 100) / 100;
          try {
            await this.zoho.recordPayment(appointment.id, invoiceId, paid, paymentMode);
          } catch (error) {
            // The invoice exists; only the payment entry is missing.
            this.logger.error(
              `ZohoBooks payment not recorded for appointment ${appointment.id}: ${error.message}`,
            );
          }
        }
      }),
    ]);
  }

  /** Appointments were cancelled (by the client). */
  async onBookingCancelled(appointmentIds: string[]): Promise<void> {
    if (appointmentIds.length === 0) return;
    const appointments = await this.appointmentRepo.find({
      where: { id: In(appointmentIds) },
      relations: ['business'],
    });
    if (appointments.length === 0) return;
    const business = appointments[0].business;

    await Promise.all([
      this.google_(business, async () => {
        for (const appointment of appointments) {
          if (!appointment.googleEventId) continue;
          await this.google.deleteCalendarEvent(business.id, appointment.googleEventId);
          await this.appointmentRepo.update(appointment.id, { googleEventId: null as any });
        }
      }),
      this.zoho_(business, async () => {
        for (const appointment of appointments) {
          if (!appointment.zohoInvoiceId) continue;
          try {
            await this.zoho.voidInvoice(appointment.id);
          } catch (error) {
            // Books refuses to void an invoice that already has a payment
            // applied; the merchant has to handle that one in Books.
            this.logger.warn(
              `ZohoBooks invoice for appointment ${appointment.id} was not voided: ${error.message}`,
            );
          }
        }
      }),
    ]);
  }

  /** An appointment moved to a new date/time. */
  async onBookingRescheduled(appointmentId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business'],
    });
    if (!appointment || appointment.status === AppointmentStatus.CANCELLED) return;

    await this.google_(appointment.business, async () => {
      if (appointment.googleEventId) {
        await this.google.updateCalendarEvent(appointment.id, appointment.googleEventId);
      } else {
        const eventId = await this.google.createCalendarEvent(appointment.id);
        await this.appointmentRepo.update(appointment.id, { googleEventId: eventId });
      }
    });
  }
}
