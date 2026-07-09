import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailchimpCredentials } from '../entities/mail-chimp.entity';
import { Appointment } from 'src/business/entities/appointment.entity';
import mailchimp from '@mailchimp/mailchimp_marketing';
import { UpdateBusinessOwnerSettingsDto } from 'src/business/dtos/requests/BusinessOwnerSettingsDto';
import { BusinessOwnerSettingsService } from 'src/business/services/business-owner-settings.service';

@Injectable()
export class MailchimpService {
  private apiKey;
  private audienceId;

  constructor(
    @InjectRepository(MailchimpCredentials)
    private mailchimpCredsRepo: Repository<MailchimpCredentials>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,

    private readonly businessOwnerSettingsService: BusinessOwnerSettingsService,
  ) {
    const apiKey = process.env.MAILCHIMP_API_KEY;
    const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;

    if (!apiKey || !audienceId) {
      throw new Error('Mailchimp credentials not found');
    }

    this.apiKey = apiKey;
    this.audienceId = audienceId;
  }

  /**
   * Connect Mailchimp with API key
   */
  async connect(
    ownerId: string,
    businessId: string,
    updateDto: UpdateBusinessOwnerSettingsDto,
  ): Promise<MailchimpCredentials> {
    // Extract server prefix from API key (last part after the dash)
    const serverPrefix = this.apiKey.split('-').pop() || '';

    // Test the API key
    mailchimp.setConfig({
      apiKey: this.apiKey,
      server: serverPrefix,
    });

    try {
      await mailchimp.ping.get();

      // Save credentials
      let credentials = await this.mailchimpCredsRepo.findOne({
        where: { business: { id: businessId } },
      });

      if (credentials) {
        credentials.apiKey = this.apiKey;
        credentials.serverPrefix = serverPrefix;
        credentials.audienceId = this.audienceId || credentials.audienceId;
      } else {
        credentials = this.mailchimpCredsRepo.create({
          business: { id: businessId },
          apiKey: this.apiKey,
          serverPrefix,
          audienceId: this.audienceId,
        });
      }

      await this.mailchimpCredsRepo.save(credentials);

      await this.businessOwnerSettingsService.update(
        ownerId,
        businessId,
        updateDto,
      );

      return credentials;
    } catch (error) {
      throw new BadRequestException(
        'Invalid Mailchimp API key: ' + error.message,
      );
    }
  }

  /**
   * Get configured Mailchimp client for business
   */
  private async getClient(businessId: string) {
    const credentials = await this.mailchimpCredsRepo.findOne({
      where: { business: { id: businessId } },
    });

    if (!credentials) {
      throw new BadRequestException(
        'Mailchimp not connected for this business',
      );
    }

    mailchimp.setConfig({
      apiKey: credentials.apiKey,
      server: credentials.serverPrefix,
    });

    return { client: mailchimp, audienceId: credentials.audienceId };
  }

  /**
   * Add/Update client as Mailchimp contact
   */
  async syncContact(appointmentId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business', 'client'],
    });

    if (!appointment) {
      throw new BadRequestException('Appointment not found');
    }

    const { client: mc, audienceId } = await this.getClient(
      appointment.business.id,
    );

    if (!audienceId) {
      throw new BadRequestException('Mailchimp audience not configured');
    }

    try {
      const subscriberHash = require('crypto')
        .createHash('md5')
        .update(appointment.client.email.toLowerCase())
        .digest('hex');

      // Add or update contact
      await mc.lists.setListMember(audienceId, subscriberHash, {
        email_address: appointment.client.email,
        status_if_new: 'subscribed',
        merge_fields: {
          FNAME: appointment.client.firstName.split(' ')[0],
          LNAME: appointment.client.surname.split(' ').slice(1).join(' ') || '',
        },
        tags: ['customer', 'appointment-booked'],
      });
    } catch (error) {
      console.error('Failed to sync contact to Mailchimp:', error);
      throw new BadRequestException('Failed to sync contact: ' + error.message);
    }
  }

  /**
   * Send appointment confirmation email
   */
  async sendAppointmentConfirmation(appointmentId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business', 'client', 'staff'],
    });

    if (!appointment) {
      throw new BadRequestException('Appointment not found');
    }

    const { client: mc } = await this.getClient(appointment.business.id);

    try {
      await mc.messages.send({
        message: {
          subject: `Appointment Confirmation - ${appointment.serviceName}`,
          text: `
Hi ${appointment.client.firstName},

Your appointment has been confirmed!

Service: ${appointment.serviceName}
Date: ${appointment.date}
Time: ${appointment.time}
Duration: ${appointment.duration}
Staff: ${appointment.staff.map((s) => s.firstName).join(', ')}
Location: ${appointment.business.businessAddress}

Amount: $${appointment.amount}
Payment Status: ${appointment.paymentStatus}

${appointment.specialRequests ? `Special Requests: ${appointment.specialRequests}` : ''}

If you need to reschedule or cancel, please contact us.

Thank you,
${appointment.business.businessName}
          `.trim(),
          from_email: appointment.business.ownerEmail,
          to: [
            {
              email: appointment.client.email,
              name: appointment.client.firstName,
              type: 'to',
            },
          ],
        },
      });
    } catch (error) {
      console.error('Failed to send email via Mailchimp:', error);
    }
  }

  /**
   * Send appointment reminder (24 hours before)
   */
  async sendAppointmentReminder(appointmentId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business', 'client', 'staff'],
    });

    if (!appointment) return;

    const { client: mc } = await this.getClient(appointment.business.id);

    try {
      await mc.messages.send({
        message: {
          subject: `Reminder: Appointment Tomorrow - ${appointment.serviceName}`,
          text: `
Hi ${appointment.client.firstName},

This is a friendly reminder about your upcoming appointment tomorrow!

Service: ${appointment.serviceName}
Date: ${appointment.date}
Time: ${appointment.time}
Staff: ${appointment.staff.map((s) => s.firstName).join(', ')}
Location: ${appointment.business.businessAddress}

We look forward to seeing you!

${appointment.business.businessName}
          `.trim(),
          from_email: appointment.business.ownerEmail,
          to: [
            {
              email: appointment.client.email,
              name: appointment.client.firstName,
              type: 'to',
            },
          ],
        },
      });
    } catch (error) {
      console.error('Failed to send reminder via Mailchimp:', error);
    }
  }

  /**
   * Send appointment acceptance/approval email
   */
  async sendAppointmentAcceptance(appointmentId: string): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business', 'client', 'staff'],
    });

    if (!appointment) {
      throw new BadRequestException('Appointment not found');
    }

    const { client: mc } = await this.getClient(appointment.business.id);

    try {
      await mc.messages.send({
        message: {
          subject: `Appointment Approved - ${appointment.serviceName}`,
          text: `
Hi ${appointment.client.firstName},

Great news! Your appointment request has been approved.

Appointment Details:
Service: ${appointment.serviceName}
Date: ${appointment.date}
Time: ${appointment.time}
Duration: ${appointment.duration}
Staff: ${appointment.staff.map((s) => s.firstName).join(', ')}
Location: ${appointment.business.businessAddress}

Amount: $${appointment.amount}
Payment Status: ${appointment.paymentStatus}

${appointment.specialRequests ? `Special Requests: ${appointment.specialRequests}` : ''}

Please arrive 10 minutes early. If you need to reschedule or have any questions, feel free to contact us.

We look forward to seeing you!

${appointment.business.businessName}
${appointment.business.ownerPhone || ''}
${appointment.business.ownerEmail}
          `.trim(),
          from_email: appointment.business.ownerEmail,
          to: [
            {
              email: appointment.client.email,
              name: appointment.client.firstName,
              type: 'to',
            },
          ],
        },
      });
    } catch (error) {
      console.error('Failed to send acceptance email via Mailchimp:', error);
      throw new BadRequestException(
        'Failed to send acceptance email: ' + error.message,
      );
    }
  }

  /**
   * Send appointment rejection email
   */
  async sendAppointmentRejection(
    appointmentId: string,
    rejectionReason?: string,
  ): Promise<void> {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['business', 'client', 'staff'],
    });

    if (!appointment) {
      throw new BadRequestException('Appointment not found');
    }

    const { client: mc } = await this.getClient(appointment.business.id);

    try {
      await mc.messages.send({
        message: {
          subject: `Appointment Request Declined - ${appointment.serviceName}`,
          text: `
Hi ${appointment.client.firstName},

We regret to inform you that your appointment request has been declined.

Appointment Details:
Service: ${appointment.serviceName}
Date: ${appointment.date}
Time: ${appointment.time}
${rejectionReason ? `\nReason: ${rejectionReason}` : ''}

We apologize for any inconvenience this may cause. Please feel free to contact us to reschedule or discuss alternative dates and times.

Thank you for your understanding.

${appointment.business.businessName}
${appointment.business.ownerPhone || ''}
${appointment.business.ownerEmail}
          `.trim(),
          from_email: appointment.business.ownerEmail,
          to: [
            {
              email: appointment.client.email,
              name: appointment.client.firstName,
              type: 'to',
            },
          ],
        },
      });
    } catch (error) {
      console.error('Failed to send rejection email via Mailchimp:', error);
      throw new BadRequestException(
        'Failed to send rejection email: ' + error.message,
      );
    }
  }

  /**
   * Disconnect Mailchimp
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
    await this.mailchimpCredsRepo.delete({ business: { id: businessId } });
  }
}
