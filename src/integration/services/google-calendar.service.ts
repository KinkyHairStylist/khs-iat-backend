import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google, calendar_v3 } from 'googleapis';
import { GoogleCredentials } from '../entities/google-credentials.entity';
import { Appointment } from 'src/business/entities/appointment.entity';
import { BusinessOwnerSettingsService } from 'src/business/services/business-owner-settings.service';
import { IntegrationAccessService } from './integration-access.service';
import {
  IntegrationAuthError,
  eventLocalTimes,
  integrationRedirectUri,
} from '../integration.helpers';

const TIME_ZONE_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly timeZones = new Map<string, { zone: string; at: number }>();

  constructor(
    @InjectRepository(GoogleCredentials)
    private googleCredsRepo: Repository<GoogleCredentials>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
    private readonly access: IntegrationAccessService,
  ) {}

  // One OAuth client per call. A shared client would hold whichever salon's
  // tokens were set last, so two salons syncing at once could write to each
  // other's calendars.
  private newOAuthClient() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
    const redirectUri = integrationRedirectUri('google-calendar');
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !redirectUri) {
      throw new BadRequestException(
        'Google Calendar is not set up on this server yet.',
      );
    }
    return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
  }

  /**
   * The Google sign-in URL for the merchant to authorise. `state` is signed and
   * tied to this merchant and salon.
   */
  async getAuthUrl(businessId: string, ownerId: string): Promise<string> {
    await this.access.assertOwnsBusiness(ownerId, businessId);

    return this.newOAuthClient().generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      prompt: 'consent',
      state: this.access.signState('google-calendar', businessId, ownerId),
    });
  }

  /**
   * Finish the OAuth hand-off: verify the signed state, swap the code for
   * tokens and store them for the salon.
   */
  async handleOAuthCallback(
    code: string,
    state: string,
    ownerId: string,
  ): Promise<void> {
    if (!code) throw new BadRequestException('Missing authorisation code.');
    const businessId = this.access.verifyState('google-calendar', state, ownerId);
    await this.access.assertOwnsBusiness(ownerId, businessId);

    let tokens;
    try {
      ({ tokens } = await this.newOAuthClient().getToken(code));
    } catch (error) {
      throw new BadRequestException(
        'Failed to authenticate with Google: ' + error.message,
      );
    }

    const existing = await this.googleCredsRepo.findOne({
      where: { business: { id: businessId } },
    });
    const refreshToken = tokens.refresh_token || existing?.refreshToken;
    if (!tokens.access_token || !refreshToken) {
      throw new BadRequestException(
        'Google did not grant ongoing access. Remove KHS from your Google account permissions and connect again.',
      );
    }

    const credentials =
      existing ??
      this.googleCredsRepo.create({
        business: { id: businessId },
        calendarId: 'primary',
      });
    credentials.accessToken = tokens.access_token;
    credentials.refreshToken = refreshToken;
    credentials.expiryDate = tokens.expiry_date ?? Date.now() + 3600 * 1000;
    credentials.updatedAt = new Date();
    await this.googleCredsRepo.save(credentials);

    await this.businessOwnerSettingsService.update(ownerId, businessId, {
      integrations: { googleCalendar: true },
    });
  }

  async isConnected(businessId: string): Promise<boolean> {
    return this.googleCredsRepo.exists({
      where: { business: { id: businessId } },
    });
  }

  /**
   * An authenticated calendar client for the salon. Google refreshes an expired
   * access token by itself; the new one is written back so it isn't lost.
   */
  private async getCalendar(businessId: string): Promise<{
    calendar: calendar_v3.Calendar;
    calendarId: string;
  }> {
    const credentials = await this.googleCredsRepo.findOne({
      where: { business: { id: businessId } },
    });
    if (!credentials) {
      throw new NotFoundException(
        'Google Calendar not connected for this business',
      );
    }

    const oauth = this.newOAuthClient();
    oauth.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: Number(credentials.expiryDate),
    });
    oauth.on('tokens', (tokens) => {
      if (!tokens.access_token) return;
      void this.googleCredsRepo
        .update(
          { id: credentials.id },
          {
            accessToken: tokens.access_token,
            expiryDate: tokens.expiry_date ?? Date.now() + 3600 * 1000,
            updatedAt: new Date(),
          },
        )
        .catch((err) =>
          this.logger.error(`Failed to store refreshed Google token: ${err.message}`),
        );
    });

    return {
      calendar: google.calendar({ version: 'v3', auth: oauth }),
      calendarId: credentials.calendarId || 'primary',
    };
  }

  // A revoked or expired grant surfaces as `invalid_grant`.
  private asIntegrationError(error: any, action: string): Error {
    const text = `${error?.message ?? ''} ${error?.response?.data?.error ?? ''}`;
    if (/invalid_grant|invalid_credentials|unauthorized_client/i.test(text)) {
      return new IntegrationAuthError(
        'Google Calendar access was revoked. Please reconnect.',
      );
    }
    return new BadRequestException(`Failed to ${action}: ${error?.message}`);
  }

  // The calendar's own time zone: appointment times are stored as wall-clock
  // strings, so they have to be read in the zone the merchant's calendar uses.
  private async timeZoneFor(
    businessId: string,
    calendar: calendar_v3.Calendar,
    calendarId: string,
  ): Promise<string> {
    const cached = this.timeZones.get(businessId);
    if (cached && Date.now() - cached.at < TIME_ZONE_TTL_MS) return cached.zone;

    const { data } = await calendar.calendars.get({ calendarId });
    const zone = data.timeZone || 'UTC';
    this.timeZones.set(businessId, { zone, at: Date.now() });
    return zone;
  }

  private async loadAppointment(appointmentId: string): Promise<Appointment> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business', 'client', 'businessClient', 'staff'],
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  private buildEvent(appointment: Appointment, timeZone: string) {
    const times = eventLocalTimes(
      appointment.date,
      appointment.time,
      appointment.duration,
    );
    if (!times) {
      throw new BadRequestException('Appointment has no valid date and time.');
    }

    const clientEmail =
      appointment.client?.email ?? appointment.businessClient?.email;
    const clientName = appointment.client
      ? `${appointment.client.firstName} ${appointment.client.surname}`.trim()
      : appointment.businessClient
        ? `${appointment.businessClient.firstName} ${appointment.businessClient.lastName}`.trim()
        : 'Client';
    const staff = appointment.staff ?? [];

    const attendees = [
      ...(clientEmail ? [{ email: clientEmail, displayName: clientName }] : []),
      ...staff
        .filter((s) => !!s.email)
        .map((s) => ({
          email: s.email,
          displayName: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim(),
        })),
    ];

    return {
      summary: `${appointment.serviceName} - ${clientName}`,
      description: [
        `Service: ${appointment.serviceName}`,
        `Client: ${clientName}`,
        `Staff: ${staff.map((s) => s.firstName).join(', ')}`,
        `Duration: ${appointment.duration}`,
        `Amount: $${appointment.amount}`,
        `Status: ${appointment.status}`,
        appointment.specialRequests
          ? `\nSpecial Requests: ${appointment.specialRequests}`
          : '',
      ]
        .join('\n')
        .trim(),
      start: { dateTime: times.start, timeZone },
      end: { dateTime: times.end, timeZone },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
      colorId: '2',
    };
  }

  /** Create the calendar event for an appointment; returns Google's event id. */
  async createCalendarEvent(appointmentId: string): Promise<string> {
    const appointment = await this.loadAppointment(appointmentId);
    const businessId = appointment.business.id;
    const { calendar, calendarId } = await this.getCalendar(businessId);

    try {
      const timeZone = await this.timeZoneFor(businessId, calendar, calendarId);
      const response = await calendar.events.insert({
        calendarId,
        requestBody: this.buildEvent(appointment, timeZone),
        sendUpdates: 'all',
      });
      return response.data.id as string;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw this.asIntegrationError(error, 'create calendar event');
    }
  }

  /** Move/refresh an existing event to match the appointment. */
  async updateCalendarEvent(
    appointmentId: string,
    googleEventId: string,
  ): Promise<void> {
    const appointment = await this.loadAppointment(appointmentId);
    const businessId = appointment.business.id;
    const { calendar, calendarId } = await this.getCalendar(businessId);

    try {
      const timeZone = await this.timeZoneFor(businessId, calendar, calendarId);
      await calendar.events.update({
        calendarId,
        eventId: googleEventId,
        requestBody: this.buildEvent(appointment, timeZone),
        sendUpdates: 'all',
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw this.asIntegrationError(error, 'update calendar event');
    }
  }

  /** Remove an event. An event that is already gone counts as removed. */
  async deleteCalendarEvent(
    businessId: string,
    googleEventId: string,
  ): Promise<void> {
    const { calendar, calendarId } = await this.getCalendar(businessId);

    try {
      await calendar.events.delete({
        calendarId,
        eventId: googleEventId,
        sendUpdates: 'all',
      });
    } catch (error) {
      const status = error?.code ?? error?.response?.status;
      if (status === 404 || status === 410) return;
      throw this.asIntegrationError(error, 'delete calendar event');
    }
  }

  /** Merchant disconnects: revoke at Google (best effort), forget the tokens. */
  async disconnect(ownerId: string, businessId: string): Promise<void> {
    await this.access.assertOwnsBusiness(ownerId, businessId);
    await this.forget(businessId, ownerId, true);
  }

  /** Credentials stopped working: forget them so the UI shows Connect again. */
  async markDisconnected(businessId: string, ownerId: string): Promise<void> {
    await this.forget(businessId, ownerId, false);
  }

  private async forget(
    businessId: string,
    ownerId: string,
    revoke: boolean,
  ): Promise<void> {
    const credentials = await this.googleCredsRepo.findOne({
      where: { business: { id: businessId } },
    });

    if (credentials && revoke) {
      try {
        await this.newOAuthClient().revokeToken(credentials.refreshToken);
      } catch (error) {
        this.logger.warn(`Google token revoke failed (continuing): ${error.message}`);
      }
    }

    await this.googleCredsRepo.delete({ business: { id: businessId } });
    this.timeZones.delete(businessId);
    await this.businessOwnerSettingsService.update(ownerId, businessId, {
      integrations: { googleCalendar: false },
    });
  }
}
