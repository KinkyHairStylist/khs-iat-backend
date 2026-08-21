import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sgMail from '@sendgrid/mail';
import { ClientSchema } from '../entities/client.entity';
import { Business } from '../entities/business.entity';
import { capitalizeString } from '../utils/client.utils';
import { Communication } from '../entities/communication.entity';
import { TemplateService } from 'src/email/template.service';
import {
  SendBulkMessageDto,
  SendDirectMessageDto,
} from '../dtos/requests/CommunicationDto';

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger(CommunicationService.name);
  private fromEmail: string;
  private fromName: string;

  constructor(
    @InjectRepository(Communication)
    private communicationRepo: Repository<Communication>,

    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,

    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,

    private readonly templateService: TemplateService,
  ) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const fromName = process.env.SENDGRID_FROM_NAME;

    if (!apiKey || !fromEmail) {
      throw new Error('SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set');
    }

    sgMail.setApiKey(apiKey);
    this.fromEmail = fromEmail;
    this.fromName = fromName || 'Kinky Hairstylist';
  }

  private async getBusinessName(businessId?: string): Promise<string> {
    if (!businessId) return 'Kinky Hairstylist';
    try {
      const business = await this.businessRepo.findOne({
        where: { id: businessId },
        select: ['businessName'],
      });
      return business?.businessName || 'Kinky Hairstylist';
    } catch {
      return 'Kinky Hairstylist';
    }
  }

  async sendDirectMessage(payload: SendDirectMessageDto) {
    try {
      const client = await this.clientRepo.findOneBy({
        id: payload.clientId,
        email: payload.clientEmail,
      });

      if (!client) {
        return {
          success: false,
          error: 'Client account not found',
          message: 'This client profile not found',
        };
      }

      const { closingRemarks, ...restofPayload } = payload;
      const customMessage = this.communicationRepo.create(restofPayload);

      await this.sendDirectMessageEmail(payload);

      customMessage.sent = true;
      await this.communicationRepo.save(customMessage);

      return {
        success: true,
        data: customMessage,
        message: `Message sent ${payload.clientEmail} successfully`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to send reminder',
      };
    }
  }

  async sendBulkCustomMessages(payload: SendBulkMessageDto) {
    try {
      if (!payload.recipients || payload.recipients?.length === 0) {
        return {
          success: false,
          error: 'No recipients provided',
          message: 'Please provide at least one client email',
        };
      }

      // Arrays to hold valid and invalid recipients
      const validRecipients: typeof payload.recipients = [];
      const invalidRecipients: { name: string; email: string }[] = [];

      // Validate each recipient
      for (const recipient of payload.recipients) {
        const client = await this.clientRepo.findOneBy({
          id: recipient.clientId,
          email: recipient.clientEmail,
        });

        if (client) {
          validRecipients.push(recipient);
        } else {
          invalidRecipients.push({
            name: recipient.clientName,
            email: recipient.clientEmail,
          });
        }
      }

      if (validRecipients.length === 0) {
        return {
          success: false,
          error: 'No valid recipients',
          message: `No valid clients found for the provided recipients.`,
          invalidRecipients,
        };
      }

      // Send only to valid recipients - failures for one recipient must not
      // block delivery to the others, so this never throws; it reports
      // per-recipient outcomes instead.
      const { succeeded, failed } = await this.sendCustomMessageEmailBatch(
        payload,
        validRecipients,
      );

      if (succeeded.length === 0) {
        this.logger.error(
          `Bulk send failed for all ${validRecipients.length} valid recipient(s): ${JSON.stringify(failed)}`,
        );
        return {
          success: false,
          error: 'All sends failed',
          message: 'Failed to send message to any recipient',
          failedRecipients: failed,
          invalidRecipients,
        };
      }

      // Persist the message with only the recipients it actually reached
      const customMessage = this.communicationRepo.create({
        messageSubject: payload.messageSubject,
        message: payload.message,
        recipients: succeeded,
        sent: true,
      });

      await this.communicationRepo.save(customMessage);

      const notes: string[] = [];
      if (invalidRecipients.length > 0) {
        notes.push(
          `Invalid recipients: ${invalidRecipients
            .map((r) => `${r.name} <${r.email}>`)
            .join(', ')}`,
        );
      }
      if (failed.length > 0) {
        this.logger.error(
          `Bulk send failed for ${failed.length} recipient(s): ${JSON.stringify(failed)}`,
        );
        notes.push(
          `Failed to deliver to: ${failed
            .map((r) => `${r.name} <${r.email}>`)
            .join(', ')}`,
        );
      }

      return {
        success: true,
        data: customMessage,
        message:
          notes.length > 0
            ? `Message sent to ${succeeded.length} of ${payload.recipients.length} recipient(s). ${notes.join(' ')}`
            : 'Message sent to all recipients successfully',
      };
    } catch (error) {
      this.logger.error(
        `Bulk send failed: ${error?.response?.body ? JSON.stringify(error.response.body) : error.message}`,
      );

      return {
        success: false,
        error: error.message,
        message: 'Failed to send bulk messages',
      };
    }
  }

  //   EMAILS
  private async sendDirectMessageEmail(
    data: SendDirectMessageDto,
  ): Promise<void> {
    const businessName = await this.getBusinessName(data.businessId);
    const subject = capitalizeString(data.messageSubject);
    const text = `Dear ${data.clientName ?? 'Valued Client'},\n\n${data.message}\n\n${data.closingRemarks ?? 'Thank you'}.`;

    const html = this.templateService.render('communication-bulk', {
      businessName,
      clientName: data.clientName ?? 'Valued Client',
      subject,
      message: data.message,
      closingRemarks: data.closingRemarks ?? 'Thank you',
      frontendUrl: process.env.FRONTEND_URL || 'https://kinkyhairstylists.com',
      year: new Date().getFullYear(),
    });

    const msg = {
      to: data.clientEmail,
      from: { email: this.fromEmail, name: this.fromName },
      subject,
      text,
      html,
    };

    await sgMail.send(msg);
  }

  private async sendCustomMessageEmailBatch(
    data: SendBulkMessageDto,
    recipients: SendBulkMessageDto['recipients'],
  ): Promise<{
    succeeded: SendBulkMessageDto['recipients'];
    failed: { name: string; email: string; error: string }[];
  }> {
    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients provided');
    }

    const businessName = await this.getBusinessName(data.businessId);
    const subject = capitalizeString(data.messageSubject);
    const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
    const year = new Date().getFullYear();
    const BATCH_SIZE = 1000; // Cap on concurrent in-flight sends per chunk

    const succeeded: SendBulkMessageDto['recipients'] = [];
    const failed: { name: string; email: string; error: string }[] = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      // Promise.allSettled (not Promise.all/sgMail.send(array)) is required
      // here: one recipient's SendGrid rejection must not abort the others'
      // already-in-flight sends from being reported as successful.
      const results = await Promise.allSettled(
        batch.map((user) => {
          const clientName = user.clientName ?? 'Valued Client';
          const text = `Dear ${clientName},\n\n${data.message}\n\n${data.closingRemarks ?? 'Thank you'}.`;

          const html = this.templateService.render('communication-bulk', {
            businessName,
            clientName,
            subject,
            message: data.message,
            closingRemarks: data.closingRemarks ?? 'Thank you',
            frontendUrl,
            year,
          });

          return sgMail.send({
            to: user.clientEmail,
            from: { email: this.fromEmail, name: this.fromName },
            subject,
            text,
            html,
          });
        }),
      );

      results.forEach((result, index) => {
        const recipient = batch[index];
        if (result.status === 'fulfilled') {
          succeeded.push(recipient);
        } else {
          const reason: any = result.reason;
          failed.push({
            name: recipient.clientName,
            email: recipient.clientEmail,
            error: reason?.response?.body
              ? JSON.stringify(reason.response.body)
              : (reason?.message ?? 'Unknown error'),
          });
        }
      });
    }

    return { succeeded, failed };
  }
}
