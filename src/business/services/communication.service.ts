import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import sgMail from '@sendgrid/mail';
import { ClientSchema } from '../entities/client.entity';
import { Business } from '../entities/business.entity';
import { capitalizeString } from '../utils/client.utils';
import { Communication } from '../entities/communication.entity';
import { TemplateService } from 'src/email/template.service';
import { assertCanManageBusiness } from '../utils/business-access';
import {
  SendBulkMessageDto,
  SendDirectMessageDto,
} from '../dtos/requests/CommunicationDto';

// Who is sending. A platform admin can message any client; a merchant only their own.
export interface Sender {
  id?: string;
  sub?: string;
  isStaff?: boolean;
}

interface SenderBusiness {
  id: string | null;
  name: string;
}

const DEFAULT_SENDER_NAME = 'Kinky Hairstylist';

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
    this.fromName = fromName || DEFAULT_SENDER_NAME;
  }

  // The salon the message is sent on behalf of. It names the sender in the email, so it has to be one the
  // sender owns: a merchant cannot send as someone else's salon. With none given it is the sender's own
  // salon. Throws Forbidden, which is not swallowed into a "failed to send" answer.
  private async resolveSenderBusiness(sender: Sender, businessId?: string): Promise<SenderBusiness> {
    if (businessId) {
      const business = await this.businessRepo.findOne({ where: { id: businessId } });
      assertCanManageBusiness(sender, business);
      return { id: business!.id, name: business!.businessName || DEFAULT_SENDER_NAME };
    }
    const senderId = sender.id ?? sender.sub;
    if (!sender.isStaff && senderId) {
      const own = await this.businessRepo.findOne({ where: { ownerId: senderId } });
      if (own) return { id: own.id, name: own.businessName || DEFAULT_SENDER_NAME };
    }
    return { id: null, name: DEFAULT_SENDER_NAME };
  }

  // Only the sender's own active clients can be messaged (a platform admin can message any).
  private async findReachableClients(sender: Sender, ids: string[]): Promise<Map<string, ClientSchema>> {
    if (ids.length === 0) return new Map();
    const senderId = sender.id ?? sender.sub;
    const clients = await this.clientRepo.find({
      where: sender.isStaff
        ? { id: In(ids), isActive: true }
        : { id: In(ids), isActive: true, ownerId: senderId },
    });
    return new Map(clients.map((c) => [c.id, c]));
  }

  private displayName(client: ClientSchema, fallback?: string): string {
    return `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() || fallback || 'Valued Client';
  }

  async sendDirectMessage(payload: SendDirectMessageDto, sender: Sender) {
    const business = await this.resolveSenderBusiness(sender, payload.businessId);

    try {
      const reachable = await this.findReachableClients(sender, [payload.clientId]);
      const client = reachable.get(payload.clientId);

      // The address must be the one on file for that client.
      if (!client || client.email?.trim().toLowerCase() !== payload.clientEmail.trim().toLowerCase()) {
        return {
          success: false,
          error: 'Client account not found',
          message: 'This client profile not found',
        };
      }

      const { closingRemarks, ...restofPayload } = payload;
      const customMessage = this.communicationRepo.create({
        ...restofPayload,
        businessId: business.id ?? restofPayload.businessId,
      });

      await this.sendDirectMessageEmail(payload, business.name, client);

      customMessage.sent = true;
      await this.communicationRepo.save(customMessage);

      return {
        success: true,
        data: customMessage,
        message: `Message sent ${client.email} successfully`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to send reminder',
      };
    }
  }

  async sendBulkCustomMessages(payload: SendBulkMessageDto, sender: Sender) {
    const business = await this.resolveSenderBusiness(sender, payload.businessId);

    try {
      if (!payload.recipients || payload.recipients?.length === 0) {
        return {
          success: false,
          error: 'No recipients provided',
          message: 'Please provide at least one client email',
        };
      }

      // One entry per client, however many times they were listed.
      const uniqueRecipients = [...new Map(payload.recipients.map((r) => [r.clientId, r])).values()];

      // Arrays to hold valid and invalid recipients
      const validRecipients: { clientId: string; clientName: string; clientEmail: string }[] = [];
      const invalidRecipients: { name: string; email: string }[] = [];

      const reachable = await this.findReachableClients(
        sender,
        uniqueRecipients.map((r) => r.clientId),
      );

      for (const recipient of uniqueRecipients) {
        const client = reachable.get(recipient.clientId);
        if (client && client.email?.trim().toLowerCase() === recipient.clientEmail.trim().toLowerCase()) {
          // The stored address and name are used, not what the request said.
          validRecipients.push({
            clientId: client.id,
            clientEmail: client.email,
            clientName: this.displayName(client, recipient.clientName),
          });
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
        business.name,
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
        businessId: business.id ?? undefined,
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
            ? `Message sent to ${succeeded.length} of ${uniqueRecipients.length} recipient(s). ${notes.join(' ')}`
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
    businessName: string,
    client: ClientSchema,
  ): Promise<void> {
    const subject = capitalizeString(data.messageSubject);
    const clientName = this.displayName(client, data.clientName);
    const text = `Dear ${clientName},\n\n${data.message}\n\n${data.closingRemarks ?? 'Thank you'}.`;

    const html = this.templateService.render('communication-bulk', {
      businessName,
      clientName,
      subject,
      message: data.message,
      closingRemarks: data.closingRemarks ?? 'Thank you',
      frontendUrl: process.env.FRONTEND_URL || 'https://kinkyhairstylists.com',
      year: new Date().getFullYear(),
    });

    const msg = {
      to: client.email,
      from: { email: this.fromEmail, name: this.fromName },
      subject,
      text,
      html,
    };

    await sgMail.send(msg);
  }

  private async sendCustomMessageEmailBatch(
    data: SendBulkMessageDto,
    recipients: { clientId: string; clientName: string; clientEmail: string }[],
    businessName: string,
  ): Promise<{
    succeeded: { clientId: string; clientName: string; clientEmail: string }[];
    failed: { name: string; email: string; error: string }[];
  }> {
    if (!recipients || recipients.length === 0) {
      throw new Error('No recipients provided');
    }

    const subject = capitalizeString(data.messageSubject);
    const frontendUrl = process.env.FRONTEND_URL || 'https://kinkyhairstylists.com';
    const year = new Date().getFullYear();
    const BATCH_SIZE = 1000; // Cap on concurrent in-flight sends per chunk

    const succeeded: { clientId: string; clientName: string; clientEmail: string }[] = [];
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
