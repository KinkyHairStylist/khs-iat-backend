import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { GoogleCredentials } from '../entities/google-credentials.entity';
import { Appointment } from 'src/business/entities/appointment.entity';
import { BusinessOwnerSettingsService } from 'src/business/services/business-owner-settings.service';
import { UpdateBusinessOwnerSettingsDto } from 'src/business/dtos/requests/BusinessOwnerSettingsDto';

@Injectable()
export class GoogleCalendarService {
  //   private oauth2Client: OAuth2Client;
  private oauth2Client;

  constructor(
    @InjectRepository(GoogleCredentials)
    private googleCredsRepo: Repository<GoogleCredentials>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,

    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
  ) {
    // Initialize OAuth2 client with your credentials
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  /**
   * Generate Google OAuth URL for business to authorize
   */
  getAuthUrl(businessId: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: businessId,
    });
  }

  /**
   * Handle OAuth callback and store credentials
   */
  async handleOAuthCallback(
    code: string,
    businessId: string,
    ownerId: string,
    updateDto: UpdateBusinessOwnerSettingsDto,
  ): Promise<GoogleCredentials> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      // Check if credentials exist
      let credentials = await this.googleCredsRepo.findOne({
        where: { business: { id: businessId } },
      });

      if (credentials) {
        // Update existing credentials
        credentials.accessToken = tokens.access_token;
        credentials.refreshToken =
          tokens.refresh_token || credentials.refreshToken;
        credentials.expiryDate = tokens.expiry_date;
      } else {
        // Create new credentials
        credentials = this.googleCredsRepo.create({
          business: { id: businessId },
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiryDate: tokens.expiry_date,
          calendarId: 'primary', // Use primary calendar by default
        });
      }

      await this.googleCredsRepo.save(credentials);

      await this.businessOwnerSettingsService.update(
        ownerId,
        businessId,
        updateDto,
      );

      return credentials;
    } catch (error) {
      throw new BadRequestException(
        'Failed to authenticate with Google: ' + error.message,
      );
    }
  }

  /**
   * Get authenticated calendar client for a business
   */
  async getCalendarClient(businessId: string) {
    const credentials = await this.googleCredsRepo.findOne({
      where: { business: { id: businessId } },
    });

    if (!credentials) {
      throw new NotFoundException(
        'Google Calendar not connected for this business',
      );
    }

    // Set credentials
    this.oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiryDate,
    });

    // Check if token needs refresh
    if (Date.now() >= credentials.expiryDate) {
      const { credentials: newTokens } =
        await this.oauth2Client.refreshAccessToken();

      // Update stored credentials
      credentials.accessToken = newTokens.access_token;
      credentials.expiryDate = newTokens.expiry_date;
      await this.googleCredsRepo.save(credentials);

      this.oauth2Client.setCredentials(newTokens);
    }

    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Create a calendar event from appointment
   */
  async createCalendarEvent(appointmentId: string): Promise<string> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business', 'client', 'staff'],
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const calendar = await this.getCalendarClient(appointment.business.id);

    // Parse date and time
    const startDateTime = this.parseDateTime(
      appointment.date,
      appointment.time,
    );
    const durationMinutes = this.parseDuration(appointment.duration);
    const endDateTime = new Date(
      startDateTime.getTime() + durationMinutes * 60000,
    );

    // Create attendees list
    const attendees = [
      {
        email: appointment.client.email,
        displayName:
          appointment.client.firstName + ' ' + appointment.client.surname,
      },
      ...appointment.staff.map((s) => ({
        email: s.email,
        displayName: s.firstName + ' ' + s.lastName,
      })),
    ];

    const event = {
      summary: `${appointment.serviceName} - ${appointment.client.firstName + ' ' + appointment.client.surname}`,
      description: `
Service: ${appointment.serviceName}
Client: ${appointment.client.firstName + ' ' + appointment.client.surname}
Staff: ${appointment.staff.map((s) => s.firstName).join(', ')}
Duration: ${appointment.duration}
Amount: $${appointment.amount}
Status: ${appointment.status}
${appointment.specialRequests ? `\nSpecial Requests: ${appointment.specialRequests}` : ''}
      `.trim(),
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/New_York', // Adjust based on business timezone
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/New_York',
      },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 60 }, // 1 hour before
        ],
      },
      colorId: '2', // Sage color for appointments
    };

    try {
      const credentials = await this.googleCredsRepo.findOne({
        where: { business: { id: appointment.business.id } },
      });

      if (!credentials) {
        throw new NotFoundException('Credentials not found');
      }
      const response = await calendar.events.insert({
        calendarId: credentials.calendarId || 'primary',
        requestBody: event,
        sendUpdates: 'all', // Send email notifications to all attendees
      });

      return response.data.id as string;
    } catch (error) {
      throw new BadRequestException(
        'Failed to create calendar event: ' + error.message,
      );
    }
  }

  /**
   * Update existing calendar event
   */
  async updateCalendarEvent(
    appointmentId: string,
    googleEventId: string,
  ): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business', 'client', 'staff'],
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const calendar = await this.getCalendarClient(appointment.business.id);

    const startDateTime = this.parseDateTime(
      appointment.date,
      appointment.time,
    );
    const durationMinutes = this.parseDuration(appointment.duration);
    const endDateTime = new Date(
      startDateTime.getTime() + durationMinutes * 60000,
    );

    const attendees = [
      {
        email: appointment.client.email,
        displayName:
          appointment.client.firstName + ' ' + appointment.client.surname,
      },
      ...appointment.staff.map((s) => ({
        email: s.email,
        displayName:
          appointment.client.firstName + ' ' + appointment.client.surname,
      })),
    ];

    const event = {
      summary: `${appointment.serviceName} - ${appointment.client.firstName + ' ' + appointment.client.surname}`,
      description: `
Service: ${appointment.serviceName}
Client: ${appointment.client.firstName + ' ' + appointment.client.surname}
Staff: ${appointment.staff.map((s) => s.firstName).join(', ')}
Duration: ${appointment.duration}
Amount: $${appointment.amount}
Status: ${appointment.status}
${appointment.specialRequests ? `\nSpecial Requests: ${appointment.specialRequests}` : ''}
      `.trim(),
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/New_York',
      },
      attendees,
    };

    try {
      const credentials = await this.googleCredsRepo.findOne({
        where: { business: { id: appointment.business.id } },
      });

      if (!credentials) {
        throw new NotFoundException('Credentials not found');
      }

      await calendar.events.update({
        calendarId: credentials.calendarId || 'primary',
        eventId: googleEventId,
        requestBody: event,
        sendUpdates: 'all',
      });
    } catch (error) {
      throw new BadRequestException(
        'Failed to update calendar event: ' + error.message,
      );
    }
  }

  /**
   * Delete calendar event
   */
  async deleteCalendarEvent(
    businessId: string,
    googleEventId: string,
  ): Promise<void> {
    const calendar = await this.getCalendarClient(businessId);

    try {
      const credentials = await this.googleCredsRepo.findOne({
        where: { business: { id: businessId } },
      });

      if (!credentials) {
        throw new NotFoundException('Credentials not found');
      }

      await calendar.events.delete({
        calendarId: credentials.calendarId || 'primary',
        eventId: googleEventId,
        sendUpdates: 'all',
      });
    } catch (error) {
      throw new BadRequestException(
        'Failed to delete calendar event: ' + error.message,
      );
    }
  }

  /**
   * Helper: Parse date and time strings to DateTime
   */
  private parseDateTime(date: string, time: string): Date {
    // Assuming date format: "2024-01-15" and time format: "2:00 PM"
    const [timePart, meridiem] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);

    if (meridiem === 'PM' && hours !== 12) {
      hours += 12;
    } else if (meridiem === 'AM' && hours === 12) {
      hours = 0;
    }

    const dateTime = new Date(date);
    dateTime.setHours(hours, minutes, 0, 0);
    return dateTime;
  }

  /**
   * Helper: Parse duration string to minutes
   */
  private parseDuration(duration: string): number {
    // Assuming format: "4:00 PM (120 min)"
    const match = duration.match(/\((\d+)\s*min\)/);
    return match ? parseInt(match[1]) : 60; // Default 60 minutes
  }

  /**
   * Disconnect Google Calendar
   */
  async disconnect(
    ownerId: string,
    businessId: string,
    updateDto: UpdateBusinessOwnerSettingsDto,
  ): Promise<void> {
    await this.businessOwnerSettingsService.update(
      ownerId,
      businessId,
      updateDto,
    );
    await this.googleCredsRepo.delete({ business: { id: businessId } });
  }
}
