import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sgMail from '@sendgrid/mail';
import { ClientSchema } from '../entities/client.entity';
import { capitalizeString } from '../utils/client.utils';
import { Communication } from '../entities/communication.entity';
import {
  SendBulkMessageDto,
  SendDirectMessageDto,
} from '../dtos/requests/CommunicationDto';

@Injectable()
export class CommunicationService {
  private fromEmail: string;

  constructor(
    @InjectRepository(Communication)
    private communicationRepo: Repository<Communication>,

    @InjectRepository(ClientSchema)
    private readonly clientRepo: Repository<ClientSchema>,
  ) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      throw new Error('SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be set');
    }

    sgMail.setApiKey(apiKey);
    this.fromEmail = fromEmail;
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
      console.log('ERROR MSG', error);
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

      // Save the message only for valid recipients
      const customMessage = this.communicationRepo.create({
        messageSubject: payload.messageSubject,
        message: payload.message,
        recipients: validRecipients,
        sent: false,
      });

      await this.communicationRepo.save(customMessage);

      // Send to multiple recipients at once
      await this.sendCustomMessageEmailBatch(payload);

      // Mark as sent
      customMessage.sent = true;
      await this.communicationRepo.save(customMessage);

      let invalidMessage = '';
      if (invalidRecipients.length > 0) {
        invalidMessage = invalidRecipients
          .map((r) => `${r.name} <${r.email}>`)
          .join(', ');
      }

      return {
        success: true,
        data: customMessage,
        message: invalidMessage
          ? `Message sent to valid clients. Invalid recipients: ${invalidMessage}`
          : 'Message sent to all recipients successfully',
      };
    } catch (error) {
      console.error('Bulk send failed:', error);
      //   console.error('❌ SendGrid Error Details:');
      //   console.error('Status Code:', error.code);
      //   console.error(
      //     'Error Body:',
      //     JSON.stringify(error.response.body, null, 2),
      //   );

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
    const emailText = `Dear ${data.clientName ?? 'Valued Client'},\n\n${data.message}\n\nPlease let us know if you have any questions or require additional support.\n\n${data.closingRemarks ?? 'Thank you'}.`;

    const msg = {
      to: data.clientEmail,
      from: this.fromEmail,
      subject: `${capitalizeString(data.messageSubject)}`,
      text: emailText,
      html: `
        <p>Dear <strong>${data.clientName ?? 'Valued Client'}</strong>,</p>
        <p>${data.message}</p>
        <p>Please let us know if you have any questions or require additional support.</p>
        <p>If you need assistance or wish to make changes, feel free to contact us.</p>
        <p><strong>${data.closingRemarks ?? 'Thank you'}.</strong></p>
      `,
    };

    await sgMail.send(msg);
    // console.log('SendGrid Response Status:', response.statusCode);
    // console.log('SendGrid Headers:', response.headers);
  }

  private async sendCustomMessageEmailBatch(
    data: SendBulkMessageDto,
  ): Promise<void> {
    if (!data.recipients || data.recipients.length === 0) {
      throw new Error('No recipients provided');
    }

    const BATCH_SIZE = 1000; // SendGrid's limit per request

    for (let i = 0; i < data.recipients.length; i += BATCH_SIZE) {
      const batch = data.recipients.slice(i, i + BATCH_SIZE);

      const messages = batch.map((user) => ({
        to: user.clientEmail,
        from: this.fromEmail,
        subject: capitalizeString(data.messageSubject),
        text: `Dear ${user.clientName ?? 'Valued Client'},\n\n${data.message}\n\nPlease let us know if you have any questions or require additional support.\n\n${data.closingRemarks ?? 'Thank you'}.`,
        html: `
        <p>Dear <strong>${user.clientName ?? 'Valued Client'}</strong>,</p>
        <p>${data.message}</p>
        <p>Please let us know if you have any questions or require additional support.</p>
        <p><strong>${data.closingRemarks ?? 'Thank you'}.</strong></p>
      `,
      }));

      await sgMail.send(messages);
    }
  }
}
