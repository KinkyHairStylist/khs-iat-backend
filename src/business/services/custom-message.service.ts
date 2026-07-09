import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sgMail from '@sendgrid/mail';
import { ClientSchema } from '../entities/client.entity';
import { capitalizeString } from '../utils/client.utils';
import { CustomMessage } from '../entities/custom-message.entity';
import { SendCustomMessageDto } from '../dtos/requests/CustomMesssageDto';

@Injectable()
export class CustomMessageService {
  private fromEmail: string;

  constructor(
    @InjectRepository(CustomMessage)
    private customMessageRepo: Repository<CustomMessage>,

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

  async sendCustomMessage(payload: SendCustomMessageDto) {
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
      const customMessage = this.customMessageRepo.create(restofPayload);

      await this.sendCustomMessageEmail(payload);

      customMessage.sent = true;
      await this.customMessageRepo.save(customMessage);

      return {
        success: true,
        data: customMessage,
        message: 'Message sent successfully',
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

  private async sendCustomMessageEmail(
    data: SendCustomMessageDto,
  ): Promise<void> {
    let emailText = data.message;

    emailText = `Dear ${data.clientName},
  
${data.message}

Please let us know if you have any questions or require additional support.
        
${data.closingRemarks ?? 'Thank You'}.`;

    const msg = {
      to: data.clientEmail,
      from: this.fromEmail,
      subject: `${capitalizeString(data.messageSubject)}`,
      text: emailText,
    };

    await sgMail.send(msg);
  }
}
